#  Kamiak HPC Cluster

<img width="2400" height="1582" alt="Gemini_Generated_Image_hvpjj2hvpjj2hvpj" src="https://github.com/user-attachments/assets/4b954612-1d25-4c09-a2ca-a276b055eca0" />
<div align="center">

**A modern, web-based interface for the Kamiak HPC Cluster.**  
Replaces  command-line interactions with a dashboard.

[Features](#-key-features) • [Installation](#-installation) • [LLM Integration](#-llm-integration) • [Tech Stack](#-technology-stack)

</div>

---
<img width="1077" height="480" alt="image" src="https://github.com/user-attachments/assets/5f6c0d2e-28ab-42e2-a141-35df0b201e1e" />

## ✨ Key Features

### 🖥️ Cluster Management
*   **Secure Auth**: SSH-based login with password or private key support.
*   **File Manager**: deeply integrated file browsing, editing (code/syntax highlighting), and safe deletion.
*   **Web Terminal**: Instant access to a remote shell for quick commands.

### ⚡ Job Orchestration (Slurm)
*   **Visual Job Composer**: Create SBATCH scripts using templates (Standard/GPU) without memorizing flags.
*   **Live Monitoring**: Real-time view of active queues (`squeue`) and historical jobs (`sacct`).
*   **Control**: Cancel running jobs instantly with one click.

### 🤖 LLM Studio (Gems New!)
Turn your HPC allocation into a private AI playground.
*   **One-Click Server**: Deploys a Flask-based LLM server on a GPU node automatically.
*   **Custom Models**: Run Llama 3, Mistral, Gemma 7B, and more.
*   **RAG / Context**: Upload documents (`.pdf`, `.docx`, `.txt`) to chat with your data.
*   **Markdown Chat**: Rich text formatting for code blocks, tables, and lists.
*   **Manage Models**: View and delete cached HuggingFace models to save disk space.
*   **Gems**: Custom, specialized AI assistants designed to handle repetitive tasks or provide expert, tailored help on specific topics.
<img width="1000" height="373" alt="image" src="https://github.com/user-attachments/assets/3dc6d688-d7c8-4e17-8f3f-e1f9f9de51d7" />

---
https://github.com/user-attachments/assets/aefeb9b5-d653-4b43-8fcb-be5b7f99b37b


---

## 🛠️ Installation

### Prerequisites
*   **Node.js 18+**
*   Access to an HPC cluster (via SSH)

### Quick Start

1.  **Clone the Repo**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to launch.

---

## 🧠 LLM Integration Guide

The **LLM Tab** provides a complete interface for running local LLMs on the cluster.

### 1. Start Server
Select your desired model (e.g., `meta-llama/Meta-Llama-3-8B`) and click **Start LLM Server**.
*   An `SBATCH` job is submitted to allocate a GPU node. Once running, an SSH tunnel is automatically established to your local machine.

### 2. Chat & RAG
*   **Chat**: Interact naturally with the model.
*   **Upload Context**: Click the `+` icon to upload file (PDFs or word files). The model will use this content to answer your questions.
*   **Clear Chat**: Use the "Clear Chat / Reset Context" button to wipe history and forget uploaded files.

### 3. Manage Cache
Navigate to the **Manage LLMs** sub-tab to view models stored in `$HOME/.cache/huggingface/hub`. You can delete old models here to free up your user quota.

---

## 📦 Deployment (Standalone)
### Windows Helper Script
For Windows users, a helper script `run_standalone.bat` is included. It automatically handles the copying of assets and starting the server.

### Manually
For production deployment without `node_modules` dependency :

1.  **Build**
    ```bash
    npm run build
    ```
2.  **Deploy**
    Copy the `.next/standalone` folder to your server.
    *   *Note*: Ensure you also copy `.next/static` -> `.next/standalone/.next/static` and `public` -> `.next/standalone/public`.

3.  **Run**
    ```bash
    node server.js
    ```

---

## 💻 Technology Stack

*   **Frontend**: [Next.js 16](https://nextjs.org/) (App Router), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/)
*   **Backend Ops**: SSH2 (Node.js), Slurm Workload Manager
*   **AI Backend**: Python, Flask, HuggingFace Transformers, PyTorch

---

<div align="center">
  <sub>Built for the Kamiak Cluster</sub>
</div>




