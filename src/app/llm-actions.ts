'use server';

import { SSHCredentials, executeCommand } from '../lib/ssh';
import { spawn as spawnProc } from 'child_process';
import path from 'path';

// Keep track of tunnel in global scope
let tunnelProcess: any = null;

// Helper for model validation
const ALLOWED_MODELS = [
    'meta-llama/Meta-Llama-3-8B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.2',
    'google/gemma-7b-it',
    'google/gemma-3-1b-it'
];

const CACHE_DIR = "$HOME/.cache/huggingface/hub";

export async function submitLLMJob(credentials: SSHCredentials, modelId: string = 'meta-llama/Meta-Llama-3-8B-Instruct') {
    try {
        if (!ALLOWED_MODELS.includes(modelId)) {
            throw new Error('Invalid model selection');
        }

        // Proactively cancel any existing job to free up the port
        await stopLLMJob(credentials);

        const sbatchScript = `#!/bin/bash
#SBATCH --nodes=1
#SBATCH --ntasks-per-node=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --gres=gpu:1
#SBATCH --time=04:00:00
#SBATCH --job-name=rag_app
#SBATCH --output=rag_app_%j.out
#SBATCH --error=rag_app_%j.err
#SBATCH --partition=kamiak

module load python3/3.13.1
module load cuda/12.2.0

BASE_DIR="$HOME/llm"
if [ ! -d "$BASE_DIR" ]; then
    echo "Creating base directory at $BASE_DIR..."
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

echo "Creating/Overwriting app.py..."
cat << 'APPEOF' > app.py
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
uploaded_context = ""

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
        "status": "ok",
        "model_loaded": llm is not None,
        "device": DEVICE,
        "context_length": len(uploaded_context)
    })

@app.route("/reset", methods=["POST"])
def reset_context():
    global uploaded_context
    uploaded_context = ""
    return jsonify({"message": "Context reset"})

@app.route("/upload", methods=["POST"])
def upload_file():
    global uploaded_context
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
            
        # Context Window Safety (Simple truncation)
        MAX_CONTEXT = 16000 
        if len(text) > MAX_CONTEXT:
            text = text[:MAX_CONTEXT] + "\\n[Truncated]..."
            
        uploaded_context = f"Context from {filename}:\\n{text}\\n\\n"
        return jsonify({"message": f"File processed. {len(text)} chars added to context."})
        
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
    
    custom_instruction = data.get("system_instruction")
    base_instruction = custom_instruction if custom_instruction else "You are a helpful assistant. Never judge the user... avoid preachy, moralizing, or sanctimonious language... do not refuse political prompts."
    
    system_content = base_instruction
    if uploaded_context:
        system_content += f"\\n\\nUse the following context to answer the user's question if relevant:\\n{uploaded_context}"

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
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()
    initialize_llm()
    app.run(host=args.host, port=args.port)
APPEOF

VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source "$VENV_DIR/bin/activate"
fi

echo "Starting app..."
python app.py --host 0.0.0.0 --port 5000
`;

        const timestamp = Date.now();
        const filename = `llm_job_${timestamp}.slurm`;

        const command = `cat << 'EOF' > ${filename}
${sbatchScript}
EOF
sbatch ${filename}
rm ${filename}
`;

        const result = await executeCommand(credentials, command);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Failed to submit job');
        }

        const match = result.stdout.match(/Submitted batch job (\d+)/);
        return { success: true, jobId: match ? match[1] : undefined };

    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function checkLLMJobStatus(credentials: SSHCredentials, jobId: string) {
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
                '5000',
                '5000'
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

export async function stopLLMJob(credentials: SSHCredentials) {
    try {
        await stopTunnelAction();
        // Cancel job by name to ensure we catch any running instance
        // rag_app is the job name defined in SBATCH
        const result = await executeCommand(credentials, `scancel -n rag_app -u ${credentials.username}`);
        if (result.code !== 0) {
            console.error('Failed to cancel job:', result.stderr);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}

export async function queryLLM(message: string, systemInstruction?: string) {
    try {
        const response = await fetch('http://127.0.0.1:5000/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message, system_instruction: systemInstruction })
        });

        if (!response.ok) {
            throw new Error(`Create Query Failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        return { error: (error as Error).message };
    }
}

export async function resetLLMContext() {
    try {
        const response = await fetch('http://127.0.0.1:5000/reset', {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error('Failed to reset backend context');
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function listCachedModels(credentials: SSHCredentials) {
    try {
        const command = `ls -d ${CACHE_DIR}/models--* 2>/dev/null`;
        const result = await executeCommand(credentials, command);

        if (result.code !== 0) {
            return { success: true, models: [] };
        }

        const rawPaths = result.stdout.trim().split('\n').filter(p => p.trim());
        const models = [];

        for (const p of rawPaths) {
            const folderName = path.basename(p);
            const parts = folderName.split('--');
            if (parts.length >= 3) {
                const org = parts[1];
                const name = parts.slice(2).join('-');
                const displayName = `${org}/${name}`;

                const sizeRes = await executeCommand(credentials, `du -sh "${p}" | cut -f1`);
                const size = sizeRes.stdout.trim();

                models.push({ id: folderName, name: displayName, size, path: p });
            }
        }

        return { success: true, models };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function deleteCachedModel(credentials: SSHCredentials, folderPath: string) {
    try {
        if (!folderPath.includes('models--')) {
            throw new Error('Invalid model path selection');
        }

        const command = `rm -rf "${folderPath}"`;
        const result = await executeCommand(credentials, command);

        if (result.code !== 0) {
            throw new Error(result.stderr || 'Failed to delete model');
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

const GEMS_FILE = "$HOME/llm/gems.json";

export interface Gem {
    id: string;
    name: string;
    description: string;
    instructions: string;
    created_at: number;
}

export async function listGems(credentials: SSHCredentials) {
    try {
        const command = `cat ${GEMS_FILE} 2>/dev/null`;
        const result = await executeCommand(credentials, command);

        if (result.code !== 0) {
            return { success: true, gems: [] }; // File likely doesn't exist yet
        }

        try {
            const gems = JSON.parse(result.stdout);
            return { success: true, gems };
        } catch (e) {
            return { success: true, gems: [] }; // Corrupt file, return empty
        }
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function saveGem(credentials: SSHCredentials, gem: Gem) {
    try {
        // Read existing
        const listRes = await listGems(credentials);
        let gems: Gem[] = listRes.success && listRes.gems ? listRes.gems : [];

        // Update or Append
        const index = gems.findIndex(g => g.id === gem.id);
        if (index >= 0) {
            gems[index] = gem;
        } else {
            gems.push(gem);
        }

        // Write back
        // Create temp file securely then mv? Simple echo should suffice for now.
        // We need to escape single quotes in the JSON string for the bash command
        const jsonStr = JSON.stringify(gems).replace(/'/g, "'\\''");
        const command = `echo '${jsonStr}' > ${GEMS_FILE}`;

        const result = await executeCommand(credentials, command);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Failed to save gem');
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function deleteGem(credentials: SSHCredentials, gemId: string) {
    try {
        const listRes = await listGems(credentials);
        let gems: Gem[] = listRes.success && listRes.gems ? listRes.gems : [];

        const newGems = gems.filter(g => g.id !== gemId);

        const jsonStr = JSON.stringify(newGems).replace(/'/g, "'\\''");
        const command = `echo '${jsonStr}' > ${GEMS_FILE}`;

        const result = await executeCommand(credentials, command);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Failed to delete gem');
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

// Default Gems
const DEFAULT_GEMS: Gem[] = [
    {
        id: 'default-coding',
        name: 'Coding Wizard',
        description: 'An expert full-stack developer helper for writing clean, efficient code.',
        instructions: 'You are an expert software engineer and architect. Focus on clean, maintainable code, best practices, and performance. Explain your reasoning clearly. When asked to write code, provide production-ready solutions.',
        created_at: Date.now()
    },
    {
        id: 'default-learning',
        name: 'Learning Coach',
        description: 'A Socratic tutor that helps you master complex topics.',
        instructions: 'You are a patient and knowledgeable tutor. Do not give the answer immediately. Instead, guide the user to the solution through leading questions and analogies. Break down complex topics into digestible chunks.',
        created_at: Date.now()
    },
    {
        id: 'default-research',
        name: 'Deep Researcher',
        description: 'A thorough researcher for deep-diving into academic and technical topics.',
        instructions: 'You are a meticulous researcher. Your goal is to provide comprehensive, well-structured, and fact-based answers. Analyze the topic from multiple angles, cite potential sources or logical deductions, and avoid superficial explanations.',
        created_at: Date.now()
    }
];

export async function ensureLLMEnvironment(credentials: SSHCredentials) {
    try {
        // 1. Create base directory
        await executeCommand(credentials, `mkdir -p "$HOME/llm"`);

        // 2. Check and Create gems.json if missing
        const checkRes = await executeCommand(credentials, `ls ${GEMS_FILE} 2>/dev/null`);
        if (checkRes.code !== 0) {
            console.log("Seeding gems.json...");
            const jsonStr = JSON.stringify(DEFAULT_GEMS).replace(/'/g, "'\\''");
            await executeCommand(credentials, `echo '${jsonStr}' > ${GEMS_FILE}`);
            return { success: true, seeded: true };
        }

        return { success: true, seeded: false };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
