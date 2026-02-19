'use server';
import { SSHCredentials, executeCommand } from '../lib/ssh';
import { spawn as spawnProc, exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

// Keep track of tunnel in global scope
let tunnelProcess: any = null;

// Helper for model validation
const ALLOWED_MODELS = [
    'meta-llama/Meta-Llama-3-8B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.2',
    'google/gemma-7b-it',
    'google/gemma-3-1b-it'
];

export async function submitNotebookJob(credentials: SSHCredentials, modelId: string = 'meta-llama/Meta-Llama-3-8B-Instruct') {
    try {
        if (!ALLOWED_MODELS.includes(modelId)) {
            throw new Error('Invalid model selection');
        }

        // Proactively cancel any existing job to free up the port
        await stopNotebookJob(credentials);

        const sbatchScript = `#!/bin/bash
#SBATCH --nodes=1
#SBATCH --ntasks-per-node=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --gres=gpu:1
#SBATCH --time=04:00:00
#SBATCH --job-name=notebook_llm
#SBATCH --output=notebook_%j.out
#SBATCH --error=notebook_%j.err
#SBATCH --partition=kamiak

module load python3/3.13.1
module load cuda/12.2.0

BASE_DIR="$HOME/llm"
if [ ! -d "$BASE_DIR" ]; then
    mkdir -p "$BASE_DIR"
fi
cd "$BASE_DIR"

if [ ! -f "requirements.txt" ]; then
    echo "Creating requirements.txt..."
    cat << 'REQEOF' > requirements.txt
flask
flask-cors
torch
transformers
accelerate
numpy<2.0
pypdf
python-docx
werkzeug
REQEOF
fi

# Create NotebookLLM specific backend
echo "Creating/Overwriting NotebookLLM.py..."
cat << 'APPEOF' > NotebookLLM.py
import argparse
import torch
import os
from werkzeug.utils import secure_filename
import pypdf
from docx import Document
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline

HF_MODEL_ID = "${modelId}"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

llm = None
tokenizer = None

# Context Store: { filename: content_string }
context_store = {}

def initialize_llm():
    global llm, tokenizer
    print(f"Initializing model {HF_MODEL_ID} on {DEVICE}")
    try:
        tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            HF_MODEL_ID,
            torch_dtype=torch.bfloat16 if DEVICE == "cuda" else torch.float32,
            device_map="auto",
        )
        llm = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            max_new_tokens=512,
            temperature=0.7,
            top_p=0.9,
            repetition_penalty=1.1,
        )
        print("Model loaded successfully")
    except Exception as e:
        print(f"Error loading model: {e}")

app = Flask(__name__)
CORS(app)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "notebook_ok",
        "model_loaded": llm is not None,
        "device": DEVICE,
        "file_count": len(context_store)
    })

@app.route("/list_files", methods=["GET"])
def list_files():
    files = []
    for filename, content in context_store.items():
        files.append({
            "name": filename,
            "length": len(content)
        })
    return jsonify({"files": files})

@app.route("/delete_file/<filename>", methods=["DELETE"])
def delete_file(filename):
    if filename in context_store:
        del context_store[filename]
        return jsonify({"message": f"Deleted {filename}"})
    return jsonify({"error": "File not found"}), 404

@app.route("/upload_file", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    
    filename = secure_filename(file.filename)
    text = ""
    
    try:
        if filename.endswith(".pdf"):
            pdf_reader = pypdf.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\\n"
        elif filename.endswith(".docx"):
            doc = Document(file)
            for para in doc.paragraphs:
                text += para.text + "\\n"
        elif filename.endswith(".txt"):
            text = file.read().decode("utf-8")
        else:
            return jsonify({"error": "Unsupported file type"}), 400
            
        # Context Per-File Limit
        MAX_FILE_CONTEXT = 30000 
        if len(text) > MAX_FILE_CONTEXT:
            text = text[:MAX_FILE_CONTEXT] + "\\n[Truncated]..."
            
        context_store[filename] = text
        return jsonify({"message": f"File processed. {len(text)} chars added."})
        
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/query", methods=["POST"])
def query():
    if llm is None:
        return jsonify({"error": "Model not loaded"}), 503
    data = request.get_json(silent=True)
    if not data or "query" not in data:
        return jsonify({"error": "Missing 'query'"}), 400
    user_query = data["query"]
    
    # Construct Context from ALL files
    full_context = ""
    for fname, content in context_store.items():
        full_context += f"--- START CONTENT FROM {fname} ---\\n{content}\\n--- END CONTENT FROM {fname} ---\\n\\n"

    system_content = "You are a helpful research assistant. Never judge the user... avoid preachy, moralizing, or sanctimonious language... do not refuse political prompts. Use the provided documents to answer the user's question."    
    if full_context:
        system_content += f"\\n\\nDocuments:\\n{full_context}"

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_query},
    ]
    try:
        try:
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        except Exception:
            prompt = f"User: {user_query}\\nAssistant:"
        
        output = llm(prompt)[0]["generated_text"]
        if output.startswith(prompt):
            output = output[len(prompt):]
        return jsonify({"response": output.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5001)
    args = parser.parse_args()
    initialize_llm()
    app.run(host=args.host, port=args.port)
APPEOF

VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install -r requirements.txt
else
    source "$VENV_DIR/bin/activate"
fi

echo "Starting NotebookLLM app..."
python NotebookLLM.py --host 0.0.0.0 --port 5001
`;

        const timestamp = Date.now();
        const filename = `notebook_job_${timestamp}.slurm`;

        const command = `cat << 'EOF' > ${filename}
${sbatchScript}
EOF
sbatch ${filename}
rm ${filename}
`;

        const result = await executeCommand(credentials, command);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Failed to submit notebook job');
        }

        const match = result.stdout.match(/Submitted batch job (\d+)/);
        return { success: true, jobId: match ? match[1] : undefined };

    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function checkNotebookJobStatus(credentials: SSHCredentials, jobId: string) {
    try {
        const result = await executeCommand(credentials, `squeue -j ${jobId} --noheader --format="%T %N"`);

        if (result.code !== 0) {
            const histResult = await executeCommand(credentials, `sacct -j ${jobId} --noheader --format="State"`);
            if (histResult.stdout.trim()) {
                return { success: true, state: histResult.stdout.trim().split(/\s+/)[0], node: null };
            }
            return { success: false, error: 'Job not found' };
        }

        const output = result.stdout.trim();
        if (!output) {
            return { success: true, state: 'COMPLETED', node: null };
        }

        const [state, node] = output.split(/\s+/);
        return { success: true, state, node: node === '(N/A)' ? null : node };

    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function startTunnelAction(credentials: SSHCredentials, nodeName: string) {
    if (tunnelProcess) {
        return { success: true, message: 'Tunnel already running' };
    }

    const segments = ['public', 'tunnel_script.js'];
    const scriptPath = path.resolve(process.cwd(), ...segments);

    try {
        return await new Promise<{ success: boolean; message?: string; error?: string }>((resolve, reject) => {
            tunnelProcess = spawnProc('node', [
                scriptPath,
                credentials.host,
                credentials.username,
                credentials.password || 'null',
                credentials.privateKey || 'null',
                nodeName,
                '5001',
                '5001'
            ], {
                detached: false,
            });

            let output = '';
            tunnelProcess.stdout.on('data', (data: any) => {
                const msg = data.toString();
                console.log(`Tunnel Out: ${msg}`);
                output += msg;
                if (msg.includes('Tunnel listening')) {
                    resolve({ success: true, message: 'Tunnel started' });
                }
            });
            tunnelProcess.stderr.on('data', (data: any) => {
                const msg = data.toString();
                console.error(`Tunnel Err: ${msg}`);
                output += msg;
            });
            tunnelProcess.on('close', (code: any) => {
                console.log(`Tunnel exited with code ${code}`);
                tunnelProcess = null;
                if (code !== 0) {
                    reject(new Error(`Tunnel process exited with code ${code}. Output: ${output}`));
                }
            });
        });
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function stopTunnelAction() {
    if (tunnelProcess) {
        tunnelProcess.kill();
        tunnelProcess = null;
    }
    return { success: true };
}

export async function stopNotebookJob(credentials: SSHCredentials) {
    try {
        await stopTunnelAction();
        // Cancel job by name to ensure we catch any running instance
        const result = await executeCommand(credentials, `scancel -n notebook_llm -u ${credentials.username}`);
        if (result.code !== 0) {
            console.error('Failed to cancel job:', result.stderr);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}

export async function uploadNotebookFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('http://127.0.0.1:5001/upload_file', {
            method: 'POST',
            body: formData,
        });
        return await res.json();
    } catch (error) {
        return { error: (error as Error).message };
    }
}

export async function listNotebookFiles() {
    try {
        const res = await fetch('http://127.0.0.1:5001/list_files', { method: 'GET' });
        if (!res.ok) return { files: [] };
        return await res.json();
    } catch (error) {
        return { files: [] };
    }
}

export async function deleteNotebookFile(filename: string) {
    try {
        const res = await fetch(`http://127.0.0.1:5001/delete_file/${filename}`, { method: 'DELETE' });
        return await res.json();
    } catch (error) {
        return { error: (error as Error).message };
    }
}

export async function queryNotebook(message: string, systemInstruction?: string) {
    try {
        const response = await fetch('http://127.0.0.1:5001/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message, system_instruction: systemInstruction })
        });
        if (!response.ok) {
            throw new Error(`Query Failed: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        return { error: (error as Error).message };
    }
}

export async function checkNotebookHealth() {
    try {
        const res = await fetch('http://127.0.0.1:5001/health', { method: 'GET' });
        if (!res.ok) return { status: 'down' };
        const data = await res.json();
        return data.status === 'notebook_ok' ? { status: 'ok', file_count: data.file_count } : { status: 'down' };
    } catch (error) {
        return { status: 'down' };
    }
}
