'use client';

import { useState } from 'react';
import FileManager from './FileManager';
import JobComposer from './JobComposer';
import JobMonitor from './JobMonitor';
import Terminal from './Terminal';
import LLMManager from './LLMManager';

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
      case 'llm':
        return <LLMManager credentials={credentials} />;
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
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col transition-all">
        <div className="p-6 border-b border-gray-200">
           <h2 className="text-2xl font-bold text-crimson">Kamiak</h2>
           <p className="text-xs text-gray-600 mt-2 truncate" title={credentials.username + '@' + credentials.host}>
             {credentials.username}@{credentials.host}
           </p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {['Overview', 'Files', 'Jobs', 'Monitor', 'Terminal', 'LLM'].map((tab) => (
             <button
               key={tab}
               onClick={() => setActiveTab(tab.toLowerCase())}
               className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${activeTab === tab.toLowerCase() ? 'bg-crimson text-gray-900 shadow-lg' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
             >
               {tab}
             </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
            <button
                onClick={onLogout}
                className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
            >
                Disconnect
            </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto bg-gray-100">
        <header className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold capitalize text-gray-900">{activeTab}</h1>
            <div className="flex space-x-2">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs text-green-600">Connected</span>
            </div>
        </header>
        
        {renderContent()}
      </div>
    </div>
  );
}
