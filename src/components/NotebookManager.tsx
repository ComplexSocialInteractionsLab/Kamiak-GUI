'use client';

import { useState, useEffect, useRef } from 'react';
import ChatInterface from './ChatInterface';
import { SSHCredentials } from '../lib/ssh';
import {
    submitNotebookJob,
    checkNotebookHealth,
    uploadNotebookFile,
    listNotebookFiles,
    deleteNotebookFile,
    queryNotebook,
    startTunnelAction,
    checkNotebookJobStatus,
    stopNotebookJob
} from '../app/notebook-actions';

interface NotebookManagerProps {
    credentials: SSHCredentials;
    onRefresh?: () => void;
}

export default function NotebookManager({ credentials, onRefresh }: NotebookManagerProps) {
    const [status, setStatus] = useState<'checking' | 'active' | 'inactive'>('checking');
    const [files, setFiles] = useState<{ name: string; length: number }[]>([]);
    const [uploading, setUploading] = useState(false);
    const [modelId, setModelId] = useState('meta-llama/Meta-Llama-3-8B-Instruct');
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);

    const checkStatus = async () => {
        const health = await checkNotebookHealth();
        if (health.status === 'ok') {
            setStatus('active');
            refreshFiles();
        } else {
            setStatus('inactive');
        }
    };

    const refreshFiles = async () => {
        const res = await listNotebookFiles();
        if (res.files) {
            setFiles(res.files);
        }
    };

    useEffect(() => {
        checkStatus();
        // Poll status every 10s if we think we are starting or active? 
        // Or just relies on user interaction? Active polling is better for "Starting..." phase.
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleStartServer = async () => {
        setStarting(true);
        const result = await submitNotebookJob(credentials, modelId);

        if (result.success && result.jobId) {
            // Poll for job status
            const pollInterval = setInterval(async () => {
                const statusRes = await checkNotebookJobStatus(credentials, result.jobId!);
                if (statusRes.success && statusRes.state === 'RUNNING' && statusRes.node) {
                    clearInterval(pollInterval);
                    // Job is running, start tunnel
                    const tunnelRes = await startTunnelAction(credentials, statusRes.node);
                    if (tunnelRes.success) {
                        setStatus('active');
                        setStarting(false);
                        refreshFiles();
                    } else {
                        alert("Job started but tunnel failed: " + tunnelRes.error);
                        setStarting(false);
                    }
                } else if (!statusRes.success || statusRes.state === 'COMPLETED' || statusRes.state === 'FAILED' || statusRes.state === 'CANCELLED') {
                    clearInterval(pollInterval);
                    alert("Job failed or completed unexpectedly.");
                    setStarting(false);
                }
            }, 5000);
        } else {
            alert("Failed to start server: " + (result.error || "Unknown error"));
            setStarting(false);
        }
    };

    const handleStopServer = async () => {
        if (!confirm("Are you sure you want to stop the Notebook Server? This will terminate the Slurm job.")) return;
        setStopping(true);
        const res = await stopNotebookJob(credentials);
        if (res.success) {
            setStatus('inactive');
            setFiles([]);
        } else {
            alert("Failed to stop server: " + res.error);
        }
        setStopping(false);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setUploading(true);
        const res = await uploadNotebookFile(e.target.files[0]);
        setUploading(false);
        if (res.error) {
            alert("Upload failed: ");
        } else {
            refreshFiles();
        }
    };

    const handleDelete = async (filename: string) => {
        if (!confirm("Remove \"" + filename + "\" from context?")) return;
        await deleteNotebookFile(filename);
        refreshFiles();
    };

    const handleQuery = async (msg: string) => {
        if (status !== 'active') return { error: "Notebook Server not active" };
        return await queryNotebook(msg);
    };

    if (status === 'checking') {
        return <div className="p-10 text-center text-gray-500">Checking Notebook Server Status...</div>;
    }

    if (status === 'inactive') {
        return (
            <div className="flex flex-col items-center justify-center h-full p-10 space-y-6">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Notebook Server Unavailable</h2>
                    <p className="text-gray-600 max-w-md">
                        The Notebook backend is not running. This feature requires a dedicated high-memory GPU environment to handle multiple documents.
                    </p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 w-full max-w-md">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Base Model</label>
                    <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4 focus:ring-crimson focus:border-crimson"
                    >
                        <option value="meta-llama/Meta-Llama-3-8B-Instruct">Meta Llama 3 8B Instruct</option>
                        <option value="mistralai/Mistral-7B-Instruct-v0.2">Mistral 7B Instruct v0.2</option>
                        <option value="google/gemma-7b-it">Google Gemma 7B IT</option>
                        <option value="google/gemma-3-1b-it">Google Gemma 3 1B IT (NEW!)</option>
                    </select>

                    <button
                        onClick={handleStartServer}
                        disabled={starting}
                        className="w-full bg-crimson hover:bg-[#7b1829] text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {starting ? 'Starting Server...' : 'Start Notebook Server'}
                    </button>

                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-gray-50 overflow-hidden rounded-xl border border-gray-200 relative">
            {/* Sidebar toggle button (absolute positioned when sidebar is hidden, inside sidebar when shown) */}
            {!showSidebar && (
                <button
                    onClick={() => setShowSidebar(true)}
                    className="absolute top-4 left-4 z-20 bg-white p-2 rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 text-gray-600"
                    title="Show Knowledge Sources"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><line x1="9" x2="9" y1="3" y2="21"></line></svg>
                </button>
            )}

            {/* Sidebar: Knowledge Sources */}
            {showSidebar && (
                <div className="w-80 bg-white border-r border-gray-200 flex flex-col transition-all duration-300">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800">Knowledge Sources</h3>
                            <p className="text-xs text-gray-500">Files loaded into context</p>
                        </div>
                        <button
                            onClick={() => setShowSidebar(false)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                            title="Hide Sidebar"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><line x1="9" x2="9" y1="3" y2="21"></line></svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {files.length === 0 && (
                            <div className="text-sm text-gray-400 text-center italic mt-10">
                                No files loaded.
                            </div>
                        )}
                        {files.map(file => (
                            <div key={file.name} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 group hover:border-crimson/30 transition-colors">
                                <div className="overflow-hidden">
                                    <div className="text-sm font-medium text-gray-800 truncate" title={file.name}>{file.name}</div>
                                    <div className="text-xs text-gray-500">{Math.round(file.length / 4)} tokens est.</div>
                                </div>
                                <button
                                    onClick={() => handleDelete(file.name)}
                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-1 1-1h6c0 0 1 0 1 1v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <label className="flex items-center justify-center w-full px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 cursor-pointer">                    {uploading ? 'Uploading...' : 'Add Source File'}
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.docx,.txt"
                                onChange={handleUpload}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="p-4 bg-white border-b border-gray-200 shadow-sm z-10 pl-16 md:pl-4">
                    {/* Added padding left to accommodate absolute button if needed, although button is handled above */}
                    <div className="flex justify-between items-center bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-green-700 font-medium">Notebook Server Active ({modelId.split('/')[1]})</span>
                        </div>
                        <button
                            onClick={handleStopServer}
                            disabled={stopping}
                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                            {stopping ? 'Stopping...' : 'Stop Server'}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                    <ChatInterface
                        onQuery={handleQuery}
                    // We don't really need onReset here as distinct from standard chat unless we want to clear client history
                    />
                </div>
            </div>
        </div >
    );
}

