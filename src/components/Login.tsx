'use client';

import { useState } from 'react';

export interface LoginProps {
  onLogin: (credentials: { host: string; username: string; password?: string }) => void;
  loading?: boolean;
}

export default function Login({ onLogin, loading }: LoginProps) {
  const [host, setHost] = useState('kamiak.wsu.edu');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ host, username, password });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-24 text-gray-900">
      <div className="z-10 w-full max-w-md items-center justify-between font-mono text-sm">
        <h1 className="mb-8 text-center text-4xl font-bold text-gray-900">
          Kamiak Console
        </h1>
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-xl border border-gray-200">
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="host">Host</label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-crimson"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-crimson"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-crimson"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-crimson hover:bg-[#7b1829] text-gray-900 font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
