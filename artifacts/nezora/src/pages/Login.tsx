'use client';
import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useLocation } from 'wouter';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [, navigate] = useLocation();

  async function login() {
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    });
    if (!res.ok) return setError('Wrong token or ADMIN_TOKEN is not configured.');
    const params = new URLSearchParams(window.location.search);
    navigate(params.get('next') || '/');
  }

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
        <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: '#EEF6FF', color: '#006BE6' }}><LockKeyhole /></div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em]">Personal access</h1>
        <p className="mt-2 text-sm leading-6" style={{ color: '#65758B' }}>Nezora Deploy is locked to you only. Enter your ADMIN_TOKEN from Render environment variables.</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()}
          placeholder="ADMIN_TOKEN"
          className="mt-5 h-14 w-full rounded-3xl border px-4 outline-none focus:border-blue-500"
          style={{ borderColor: '#E7ECF3' }}
        />
        <button onClick={login} className="mt-4 h-14 w-full rounded-3xl font-black text-white" style={{ background: '#0A84FF' }}>Unlock</button>
        {error && <p className="mt-3 text-sm font-bold" style={{ color: '#D97706' }}>{error}</p>}
      </div>
    </main>
  );
}
