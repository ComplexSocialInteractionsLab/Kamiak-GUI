'use client';

import { useState, useEffect } from 'react';
import { Gem } from '../app/llm-actions';
import GemManager from './GemManager';
import { submitLLMJob, checkLLMJobStatus, startTunnelAction, stopLLMJob, queryLLM, resetLLMContext, listCachedModels, deleteCachedModel } from '../app/llm-actions';
import ChatInterface from './ChatInterface';

interface LLMManagerProps {
    credentials: { host: string; username: string; password?: string };
    currentView: 'server' | 'manage' | 'gems';
    onViewChange: (view: 'server' | 'manage' | 'gems') => void;
    initialGems: Gem[];
    initialModels: { id: string, name: string, size: string, path: string }[];
    onRefresh: () => Promise<void>;
}

export default function LLMManager({ credentials, currentView, onViewChange, initialGems, initialModels, onRefresh }: LLMManagerProps) {
    // Controlled view state provided by parent
    const [status, setStatus] = useState<'idle' | 'submitting' | 'queued' | 'starting_tunnel' | 'ready' | 'error'>('idle');
    const [selectedModel, setSelectedModel] = useState('meta-llama/Meta-Llama-3-8B-Instruct');
    const [jobId, setJobId] = useState<string | null>(null);
    const [node, setNode] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [logs, setLogs] = useState<string[]>([]);

    // Manage Tab State
    const [cachedModels, setCachedModels] = useState(initialModels);
    useEffect(() => { setCachedModels(initialModels); }, [initialModels]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [manageError, setManageError] = useState('');
    const [activeGem, setActiveGem] = useState<Gem | null>(null);

    const handleSelectGem = (gem: Gem | null) => {
        setActiveGem(gem);
        onViewChange('server');
    };

    const handleQuery = (msg: string) => {
        return queryLLM(msg, activeGem?.instructions);
    };

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    // Fetch cached models when switching to manage tab
    useEffect(() => {
        if (currentView === 'manage') {
            loadModels();
        }
    }, [currentView]);

    const loadModels = async () => {
        setLoadingModels(true);
        setManageError('');
        const res = await listCachedModels(credentials);
        if (res.success && res.models) {
            setCachedModels(res.models);
        } else {
            setManageError(res.error || 'Failed to list models');
        }
        setLoadingModels(false);
    };

    const handleDeleteModel = async (path: string) => {
        if (!confirm('Are you sure you want to delete this cached model? This action cannot be undone.')) return;

        setLoadingModels(true);
        const res = await deleteCachedModel(credentials, path);
        if (res.success) {
            await loadModels(); // Refresh list
        } else {
            setManageError(res.error || 'Failed to delete model');
            setLoadingModels(false);
        }
    };

    const startServer = async () => {
        setStatus('submitting');
        setError('');
        setLogs([]);
        addLog(`Submitting SBATCH job for ${selectedModel}...`);

        const result = await submitLLMJob(credentials, selectedModel);
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
                stopLLMJob(credentials);
            }
        };
    }, []);

    const handleStop = async () => {
        await stopLLMJob(credentials);
        setStatus('idle');
        setJobId(null);
        setNode(null);
    };

    return (
        <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm min-h-[500px]">


            <div className="p-8 flex-1 flex flex-col items-center justify-center w-full">
                {currentView === 'server' && (
                    // Server Control View
                    <>
                        {status === 'idle' && (
                            <div className="w-full max-w-lg text-center">
                                <h3 className="text-2xl font-bold text-gray-900 mb-4">LLM Server</h3>
                                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                                    Start a dedicated LLM server on the Kamiak cluster. This will allocate a GPU node and provide a chat interface.
                                </p>

                                <div className="mb-6 text-left">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Model</label>
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full border border-gray-300 rounded-md shadow-sm px-4 py-2 focus:outline-none focus:ring-crimson focus:border-crimson"
                                    >
                                        <option value="meta-llama/Meta-Llama-3-8B-Instruct">Meta Llama 3 8B Instruct</option>
                                        <option value="mistralai/Mistral-7B-Instruct-v0.2">Mistral 7B Instruct v0.2</option>
                                        <option value="google/gemma-7b-it">Google Gemma 7B IT</option>
                                        <option value="google/gemma-3-1b-it">Google Gemma 3 1B IT (NEW!)</option>
                                    </select>
                                </div>

                                <button
                                    onClick={startServer}
                                    className="bg-crimson hover:bg-[#7b1829] text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform transform hover:-translate-y-0.5"
                                >
                                    Start LLM Server
                                </button>
                            </div>
                        )}

                        {status === 'ready' && (
                            <div className="w-full h-full flex flex-col space-y-4">
                                <div className="flex justify-between items-center bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                                    <div className="flex items-center space-x-2">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                        <span className="text-green-700 font-medium">LLM Connected to {node} ({selectedModel.split('/')[1]})</span>
                                    </div>
                                    <button onClick={handleStop} className="text-red-500 hover:text-red-700 text-sm font-medium">
                                        Stop Server
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0">
                                    {activeGem && (
                                        <div className="bg-gradient-to-r from-crimson to-pink-600 text-white px-4 py-2 rounded-t-lg flex justify-between items-center">
                                            <span className="font-bold flex items-center gap-2">Using Gem: {activeGem.name}</span>
                                            <button onClick={() => setActiveGem(null)} className="text-xs bg-white/20 hover:bg-white/40 px-2 py-1 rounded">Clear Gem</button>
                                        </div>
                                    )}
                                    <ChatInterface onQuery={handleQuery} onReset={resetLLMContext} />
                                </div>
                            </div>
                        )}

                        {(status === 'submitting' || status === 'queued' || status === 'starting_tunnel' || status === 'error') && (
                            <div className="w-full max-w-lg text-center">
                                {status !== 'error' && (
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson mx-auto mb-4"></div>
                                )}
                                <h3 className="text-xl font-bold text-gray-900 mb-2">
                                    {status === 'submitting' && 'Submitting Job...'}
                                    {status === 'queued' && 'Waiting for Resources...'}
                                    {status === 'starting_tunnel' && 'Establishing Connection...'}
                                    {status === 'error' && 'Error Occurred'}
                                </h3>
                                <p className="text-gray-500 mb-6">Job ID: {jobId || '...'}</p>

                                <div className="bg-gray-50 rounded p-4 font-mono text-xs text-gray-600 h-32 overflow-y-auto border border-gray-200 text-left mb-6">
                                    {logs.map((log, i) => <div key={i}>{log}</div>)}
                                </div>

                                {error && (
                                    <div className="text-red-500 bg-red-50 px-4 py-2 rounded border border-red-200 mb-6 text-left">
                                        Error: {error}
                                    </div>
                                )}

                                <button onClick={handleStop} className="text-gray-400 hover:text-gray-600 text-sm">
                                    {status === 'error' ? 'Back' : 'Cancel'}
                                </button>
                            </div>
                        )}
                    </>
                )}
                {currentView === 'manage' && (
                    // Manage LLMs View
                    <div className="w-full max-w-4xl h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Cached Models</h3>
                            <button
                                onClick={loadModels}
                                disabled={loadingModels}
                                className="text-sm text-crimson hover:underline disabled:opacity-50"
                            >
                                Refresh
                            </button>
                        </div>

                        {manageError && (
                            <div className="text-red-500 bg-red-50 px-4 py-2 rounded border border-red-200 mb-4">
                                Error: {manageError}
                            </div>
                        )}

                        {loadingModels ? (
                            <div className="flex-1 flex justify-center items-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crimson"></div>
                            </div>
                        ) : cachedModels.length === 0 ? (
                            <div className="flex-1 flex flex-col justify-center items-center text-gray-500">
                                <p>{manageError ? 'Could not load models.' : 'No models found in cache.'}</p>
                                <p className="text-xs mt-2 text-gray-400">Path: $HOME/.cache/huggingface/hub</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {cachedModels.map((model) => (
                                            <tr key={model.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {model.name}
                                                    <div className="text-xs text-gray-400 font-normal">{model.id}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {model.size}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => handleDeleteModel(model.path)}
                                                        className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="mt-4 text-xs text-gray-400 text-center">
                            Managing cache at: $HOME/.cache/huggingface/hub
                        </div>
                    </div>
                )}

                {currentView === 'gems' && (
                    <GemManager credentials={credentials} onSelectGem={handleSelectGem} initialGems={initialGems} onRefresh={onRefresh} />
                )}
            </div>
        </div>
    );
}
