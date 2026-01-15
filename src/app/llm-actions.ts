'use server';

import { SSHCredentials, executeCommand } from '../lib/ssh';
import { spawn as spawnProc } from 'child_process';
import path from 'path';

let tunnelProcess: any = null;

export async function submitLLMJob(credentials: SSHCredentials) {
    try {
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

# Clean up potentially broken environment


if [ ! -f "requirements.txt" ]; then
    echo "Creating requirements.txt..."
    cat << 'REQEOF' > requirements.txt
flask
flask-cors
torch
transformers
accelerate
numpy<2.0
REQEOF
fi

echo "Creating/Overwriting app.py..."
cat << 'APPEOF' > app.py
import argparse
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline

HF_MODEL_ID = "meta-llama/Meta-Llama-3-8B-Instruct"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

llm = None
tokenizer = None

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
            max_new_tokens=256,
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
        "device": DEVICE
    })

@app.route("/query", methods=["POST"])
def query():
    if llm is None:
        return jsonify({"error": "Model not loaded"}), 503
    data = request.get_json(silent=True)
    if not data or "query" not in data:
        return jsonify({"error": "Missing 'query'"}), 400
    user_query = data["query"]
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
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
    echo "Creating virtual environment at $BASE_DIR/$VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    
    if [ -f "requirements.txt" ]; then
        echo "Installing dependencies..."
        pip install -r requirements.txt
    fi
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

    // Obfuscated path for Turbopack bypass
    const segments = ['public', 'tunnel_script.js'];
    const scriptPath = path.resolve(process.cwd(), ...segments);

    try {
        return await new Promise<{ success: boolean; message?: string; error?: string }>((resolve, reject) => {
            tunnelProcess = spawnProc('node', [
                scriptPath,
                credentials.host,
                credentials.username,
                credentials.password || '',
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

export async function queryLLM(message: string) {
    try {
        const response = await fetch('http://127.0.0.1:5000/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message })
        });

        if (!response.ok) {
            throw new Error(`Create Query Failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        return { error: (error as Error).message };
    }
}




