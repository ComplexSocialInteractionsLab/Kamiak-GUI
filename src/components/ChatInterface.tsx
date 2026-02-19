'use client';

import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { searchWeb } from '../app/web-actions';

interface ChatInterfaceProps {
    onQuery: (msg: string, systemInstruction?: string) => Promise<any>;
    onReset?: () => Promise<any>;
}

export default function ChatInterface({ onQuery, onReset }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isInternetEnabled, setIsInternetEnabled] = useState(false);
    const [searching, setSearching] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleReset = async () => {
        if (!confirm('Start a new chat? This will clear the current history and uploaded files.')) return;
        setMessages([]);
        if (onReset) {
            await onReset();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://127.0.0.1:5000/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (res.ok) {
                setMessages(prev => [...prev, { role: 'system' as any, content: `File uploaded: ${file.name} (${data.message})` }]);
            } else {
                setMessages(prev => [...prev, { role: 'system' as any, content: `Upload failed: ${data.error}` }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'system' as any, content: `Upload error: ${(error as Error).message}` }]);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        setLoading(true);

        try {
            let systemInstruction = "";

            if (isInternetEnabled) {
                setSearching(true);
                // Perform web search
                const searchRes = await searchWeb(userMsg);
                setSearching(false);

                if (searchRes.success && searchRes.results.length > 0) {
                    const snippets = searchRes.results.map((r, i) => `[${i + 1}] ${r.title} (${r.link}): ${r.snippet}`).join('\n\n');
                    systemInstruction = `Use the following web search results to answer the user's question if relevant:\n\n${snippets}\n\n`;
                    // Visual indicator in chat (optional, or just rely on the answer)
                    setMessages(prev => [...prev, { role: 'system' as any, content: `*** Searched the web for: "${userMsg}" ***` }]);
                } else if (searchRes.error) {
                    setMessages(prev => [...prev, { role: 'system' as any, content: `[Search Failed: ${searchRes.error}]` }]);
                } else {
                    setMessages(prev => [...prev, { role: 'system' as any, content: `[No search results found]` }]);
                }
            }

            const response = await onQuery(userMsg, systemInstruction);

            let content = 'No response';
            if (response && response.generated_text) {
                content = response.generated_text;
            } else if (response && response.response) {
                content = response.response;
            } else if (response && response.error) {
                content = `Error: ${response.error}`;
            } else {
                content = typeof response === 'string' ? response : JSON.stringify(response);
            }

            setMessages(prev => [...prev, { role: 'assistant', content }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get response.' }]);
        } finally {
            setLoading(false);
            setSearching(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] border border-gray-200 rounded-lg bg-white shadow-sm">
            {/* Header for Clear Chat */}
            <div className="flex justify-end p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <button
                    onClick={handleReset}
                    className="text-xs text-gray-500 hover:text-crimson font-medium px-2 py-1 rounded hover:bg-white transition-colors"
                >
                    Clear Chat / Reset Context
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-gray-400 text-center mt-20">Start a conversation with the LLM...</div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg px-4 py-2 ${m.role === 'user' ? 'bg-crimson text-white' : m.role === 'system' as any ? 'bg-yellow-50 text-yellow-800 text-xs border border-yellow-200' : 'bg-gray-100 text-gray-900 overflow-hidden'}`}>
                            {m.role === 'user' ? (
                                <p className="whitespace-pre-wrap">{m.content}</p>
                            ) : (
                                <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-code:bg-gray-200 prose-code:rounded prose-code:px-1 prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-pre:p-2 prose-pre:rounded-md">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {m.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {(loading || searching) && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-4 py-2">
                            <span className="animate-pulse text-gray-500">{searching ? "Searching Web..." : "Thinking..."}</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex space-x-2 items-end">
                <button
                    onClick={() => setIsInternetEnabled(!isInternetEnabled)}
                    className={`p-2 rounded transition-colors ${isInternetEnabled ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                    title={isInternetEnabled ? "Internet Access: ON" : "Internet Access: OFF"}
                >
                    {/* Globe Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                </button>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || loading}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-medium disabled:opacity-50 transition-colors"
                >
                    {uploading ? "..." : "+"}
                </button>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="Type your message..."
                    className="flex-1 bg-white border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-crimson text-gray-900 resize-none overflow-hidden min-h-[40px] max-h-[200px]"
                    disabled={loading}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-crimson hover:bg-[#7b1829] text-white px-6 py-2 rounded font-medium disabled:opacity-50 transition-colors"
                >
                    Send
                </button>
            </div>
        </div>
    );
}
