'use client';

import { useState } from 'react';
import { setHuggingFaceToken } from '../app/actions';

interface SettingsProps {
    credentials: {
        host: string;
        username: string;
        password?: string;
    };
    initialHfUsername: string | null;
    onRefreshAuth: () => Promise<void>;
}

export default function Settings({ credentials, initialHfUsername, onRefreshAuth }: SettingsProps) {
    const [hfToken, setHfToken] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleTokenSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!hfToken.trim()) return;

        setStatus('loading');
        setErrorMessage('');

        try {
            const result = await setHuggingFaceToken(credentials, hfToken.trim());
            if (result.success) {
                setStatus('success');
                setHfToken(''); // clear field on success

                // Force Dashboard to refresh the state to get the new username
                await onRefreshAuth();
            } else {
                setStatus('error');
                setErrorMessage(result.error || 'Failed to authenticate. Ensure the hf CLI is installed. Use { pip install huggingface-hub } in Terminal');
            }
        } catch (error) {
            setStatus('error');
            setErrorMessage(String(error));
        }
    };

    return (
        <div className="max-w-4xl space-y-6 animate-fadeIn">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings & Integrations</h2>

                <div className="border border-gray-100 rounded-lg p-6 bg-gray-50/50">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Hugging Face API Token</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        Authenticate your server with Hugging Face to download protected models and push resources.
                    </p>

                    {initialHfUsername ? (
                        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-800">Authenticated as: <span className="font-bold">{initialHfUsername}</span></p>
                                <p className="text-xs text-green-600 mt-1">Your server is connected to Hugging Face.</p>
                            </div>
                            <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-1 rounded-full text-xs font-medium border border-green-300">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Live
                            </div>
                        </div>
                    ) : (
                        <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                            <p className="text-sm font-medium text-yellow-800">Not Authenticated</p>
                            <p className="text-xs text-yellow-600 mt-1">Please provide a token below to connect.</p>
                        </div>
                    )}

                    <form onSubmit={handleTokenSubmit} className="space-y-4 max-w-lg">
                        <div>
                            <label htmlFor="hf-token" className="block text-sm font-medium text-gray-700 mb-1">
                                Access Token
                            </label>
                            <input
                                type="password"
                                id="hf-token"
                                value={hfToken}
                                onChange={(e) => setHfToken(e.target.value)}
                                placeholder="hf_..."
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-crimson focus:border-crimson transition-shadow"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'loading' || !hfToken.trim()}
                            className="px-6 py-2 bg-crimson text-white rounded-md hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-crimson disabled:opacity-50 transition-all font-medium"
                        >
                            {status === 'loading' ? 'Authenticating...' : 'Save Token'}
                        </button>

                        {status === 'success' && (
                            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md border border-green-200">
                                Token saved and authenticated successfully!
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
                                Error: {errorMessage}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
