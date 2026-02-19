'use client';

import { useState, useEffect } from 'react';
import FileManager from './FileManager';
import JobComposer from './JobComposer';
import JobMonitor from './JobMonitor';
import Terminal from './Terminal';
import LLMManager from './LLMManager';
import NotebookManager from './NotebookManager';
import { listGems, listCachedModels, Gem } from '../app/llm-actions';

interface DashboardProps {
    credentials: {
        host: string;
        username: string;
        password?: string;
    };
    onLogout: () => void;
}

export default function Dashboard({ credentials, onLogout }: DashboardProps) {
    const [activeTab, setActiveTab] = useState('overview');
    const [llmSubTab, setLlmSubTab] = useState<'server' | 'gems' | 'manage'>('server');

    // Background Data State
    const [gems, setGems] = useState<Gem[]>([]);
    const [cachedModels, setCachedModels] = useState<{ id: string, name: string, size: string, path: string }[]>([]);
    const [loadingBackground, setLoadingBackground] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    useEffect(() => {
        // Preload data on mount
        refreshData();
    }, []);

    const refreshData = async () => {
        setLoadingBackground(true);
        try {
            const [gemsRes, modelsRes] = await Promise.all([
                listGems(credentials),
                listCachedModels(credentials)
            ]);

            if (gemsRes.success && gemsRes.gems) {
                setGems(gemsRes.gems);
            }
            if (modelsRes.success && modelsRes.models) {
                setCachedModels(modelsRes.models);
            }
        } catch (e) {
            console.error("Background fetch failed", e);
        }
        setLoadingBackground(false);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'files':
                return <FileManager credentials={credentials} />;
            case 'jobs':
                return <JobComposer credentials={credentials} />;
            case 'monitor':
                return <JobMonitor credentials={credentials} />;
            case 'terminal':
                return <Terminal credentials={credentials} />;
            case 'notebook':
                return <NotebookManager credentials={credentials} />;
            case 'llm':
                return (
                    <LLMManager
                        credentials={credentials}
                        currentView={llmSubTab}
                        onViewChange={setLlmSubTab}
                        initialGems={gems}
                        initialModels={cachedModels}
                        onRefresh={refreshData}
                    />
                );
            case 'overview':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-lg">
                                <h4 className="text-gray-600 text-sm font-medium mb-2">Cluster Status</h4>
                                <div className="text-2xl font-bold text-green-600">Operational</div>
                                <p className="text-xs text-gray-500 mt-1">Kamiak is running normally</p>
                            </div>
                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-lg">
                                <h4 className="text-gray-600 text-sm font-medium mb-2">Storage Quota</h4>
                                <div className="text-2xl font-bold text-crimson">--</div>
                                <p className="text-xs text-gray-500 mt-1">Check via console</p>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-lg">
                            <p className="text-gray-600">Welcome to your Kamiak Dashboard. Select a tab to get started.</p>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="border border-gray-200 rounded-xl p-8 bg-white/50 backdrop-blur-sm shadow-xl min-h-[400px]">
                        <p className="text-gray-600">Content for {activeTab} section is under construction.</p>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 text-gray-900 font-mono">
            {/* Sidebar */}
            <div className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out`}>
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    {!isSidebarCollapsed && (
                        <div className="overflow-hidden mr-2">
                            <h2 className="text-2xl font-bold text-crimson">Kamiak</h2>
                            <p className="text-xs text-gray-600 mt-2 truncate" title={credentials.username + '@' + credentials.host}>
                                {credentials.username}@{credentials.host}
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className={`text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors ${isSidebarCollapsed ? 'mx-auto' : ''}`}
                        title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
                    >
                        {isSidebarCollapsed ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="18" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line></svg>
                        )}
                    </button>
                </div>

                <nav className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {['Overview', 'Files', 'Jobs', 'Monitor', 'Terminal'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab.toLowerCase())}
                            className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center ${activeTab === tab.toLowerCase() ? 'bg-crimson text-gray-900 shadow-lg' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}
                            title={isSidebarCollapsed ? tab : ''}
                        >
                            {isSidebarCollapsed && <span className="text-xl">{tab.charAt(0)}</span>}
                            {!isSidebarCollapsed && <span>{tab}</span>}
                        </button>
                    ))}

                    {/* LLM Section */}
                    <div className="space-y-1">
                        <button
                            onClick={() => setActiveTab('llm')}
                            className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center ${activeTab === 'llm' ? 'bg-crimson text-gray-900 shadow-lg' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}
                            title={isSidebarCollapsed ? 'LLM' : ''}
                        >
                            {isSidebarCollapsed ? <span className="text-xl">L</span> : <span>LLM</span>}
                        </button>

                        {activeTab === 'llm' && !isSidebarCollapsed && (
                            <div className="ml-4 pl-4 border-l-2 border-gray-200 py-1 space-y-1">
                                <button
                                    onClick={() => setLlmSubTab('server')}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${llmSubTab === 'server' ? 'text-crimson font-bold bg-gray-50' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    Server Control
                                </button>
                                <button
                                    onClick={() => setLlmSubTab('gems')}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${llmSubTab === 'gems' ? 'text-crimson font-bold bg-gray-50' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    Gems
                                </button>
                                <button
                                    onClick={() => setLlmSubTab('manage')}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${llmSubTab === 'manage' ? 'text-crimson font-bold bg-gray-50' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    Manage LLMs
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Notebook Section */}
                    <button
                        onClick={() => setActiveTab('notebook')}
                        className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center ${activeTab === 'notebook' ? 'bg-crimson text-gray-900 shadow-lg' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}
                        title={isSidebarCollapsed ? 'Notebook' : ''}
                    >
                        {isSidebarCollapsed ? <span className="text-xl">N</span> : <span>Notebook</span>}
                    </button>
                </nav>

                <div className="p-4 border-t border-gray-200 space-y-2">
                    <button
                        onClick={onLogout}
                        className={`w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors ${isSidebarCollapsed ? 'text-center' : ''}`}
                        title={isSidebarCollapsed ? "Disconnect" : ""}
                    >
                        {isSidebarCollapsed ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        ) : "Disconnect"}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 overflow-auto bg-gray-100">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold capitalize text-gray-900">{activeTab}</h1>
                    <div className="flex space-x-2">
                        <span className={`w-3 h-3 rounded-full ${loadingBackground ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></span>
                        <span className="text-xs text-green-600">{loadingBackground ? 'Loading Resources...' : 'Connected'}</span>
                    </div>
                </header>

                {renderContent()}
            </div>
        </div>
    );
}
