'use client';

import { useState } from 'react';

interface ChatInterfaceProps {
    onQuery: (msg: string) => Promise<any>;
}

export default function ChatInterface({ onQuery }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        try {
            const response = await onQuery(userMsg);
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
        }
    };

    return (
        <div className="flex flex-col h-[600px] border border-gray-200 rounded-lg bg-white shadow-sm">
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-gray-400 text-center mt-20">Start a conversation with the LLM...</div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg px-4 py-2 ${m.role === 'user' ? 'bg-crimson text-white' : 'bg-gray-100 text-gray-900'}`}>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-4 py-2">
                            <span className="animate-pulse text-gray-500">Thinking...</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex space-x-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Type your message..."
                    className="flex-1 bg-white border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-crimson text-gray-900"
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

