'use client';

import { useState, useEffect } from 'react';
import { submitLLMJob, checkLLMJobStatus, startTunnelAction, stopTunnelAction, queryLLM } from '../app/llm-actions';
import ChatInterface from './ChatInterface';

interface LLMManagerProps {
    credentials: { host: string; username: string; password?: string };
}

export default function LLMManager({ credentials }: LLMManagerProps) {
    const [status, setStatus] = useState<'idle' | 'submitting' | 'queued' | 'starting_tunnel' | 'ready' | 'error'>('idle');
    const [jobId, setJobId] = useState<string | null>(null);
    const [node, setNode] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const startServer = async () => {
        setStatus('submitting');
        setError('');
        setLogs([]);
        addLog('Submitting SBATCH job...');

        const result = await submitLLMJob(credentials);
        if (result.success && result.jobId) {
            setJobId(result.jobId);
            addLog(`Job submitted: ${result.jobId}`);
            setStatus('queued');
        } else {
            setError(result.error || 'Failed to submit job');
            setStatus('error');
        }
    };

    // Poll for status
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === 'queued' && jobId) {
            interval = setInterval(async () => {
                const check = await checkLLMJobStatus(credentials, jobId);
                if (check.success) {
                    addLog(`Job State: ${check.state}` + (check.node ? ` Node: ${check.node}` : ''));
                    
                    if (check.state === 'RUNNING' && check.node) {
                        setNode(check.node);
                        setStatus('starting_tunnel');
                        clearInterval(interval);
                    } else if (check.state && ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(check.state)) {
                        setError(`Job ended with state: ${check.state}`);
                        setStatus('error');
                        clearInterval(interval);
                    }
                }
            }, 5000);
        }

        return () => clearInterval(interval);
    }, [status, jobId, credentials]);

    // Start Tunnel
    useEffect(() => {
        const initTunnel = async () => {
            if (status === 'starting_tunnel' && node) {
                addLog(`Starting tunnel to ${node}...`);
                const tunnel = await startTunnelAction(credentials, node);
                if (tunnel.success) {
                    addLog('Tunnel established successfully.');
                    setStatus('ready');
                } else {
                    setError(tunnel.error || 'Failed to start tunnel');
                    setStatus('error');
                }
            }
        };
        initTunnel();
    }, [status, node, credentials]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (status === 'ready') {
                stopTunnelAction();
            }
        };
    }, []);

    const handleStop = async () => {
        await stopTunnelAction();
        setStatus('idle');
        setJobId(null);
        setNode(null);
    };

    if (status === 'idle') {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm min-h-[400px]">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">LLM Server</h3>
                <p className="text-gray-600 mb-8 text-center max-w-md">
                    Start a dedicated LLM server on the Kamiak cluster. This will allocate a GPU node and provide a chat interface.
                </p>
                <button 
                    onClick={startServer}
                    className="bg-crimson hover:bg-[#7b1829] text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform transform hover:-translate-y-0.5"
                >
                    Start LLM Server
                </button>
            </div>
        );
    }

    if (status === 'ready') {
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-green-700 font-medium">LLM Connect to {node}</span>
                    </div>
                    <button onClick={handleStop} className="text-red-500 hover:text-red-700 text-sm font-medium">
                        Stop Server
                    </button>
                </div>
                <ChatInterface onQuery={queryLLM} />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson mb-4"></div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
                {status === 'submitting' && 'Submitting Job...'}
                {status === 'queued' && 'Waiting for Resources...'}
                {status === 'starting_tunnel' && 'Establishing Connection...'}
            </h3>
            <p className="text-gray-500 mb-6">Job ID: {jobId || '...'}</p>
            
            <div className="w-full max-w-md bg-gray-50 rounded p-4 font-mono text-xs text-gray-600 h-32 overflow-y-auto border border-gray-200">
                {logs.map((log, i) => <div key={i}>{log}</div>)}
            </div>
            
            {error && (
                <div className="mt-4 text-red-500 bg-red-50 px-4 py-2 rounded border border-red-200">
                    Error: {error}
                </div>
            )}
            
             <button onClick={handleStop} className="mt-6 text-gray-400 hover:text-gray-600 text-sm">
                Cancel
            </button>
        </div>
    );
}

