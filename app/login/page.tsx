'use client';
import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  async function login() {
    setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!res.ok) return setError('Wrong token or ADMIN_TOKEN is not configured.');
    window.location.href = new URLSearchParams(location.search).get('next') || '/';
  }
  return <main className="grid min-h-screen place-items-center px-5"><div className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-soft ring-1 ring-line"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><LockKeyhole /></div><h1 className="mt-5 text-3xl font-black tracking-[-0.04em]">Personal access</h1><p className="mt-2 text-sm leading-6 text-muted">Nezora Deploy is locked to you only. Enter your ADMIN_TOKEN from Render environment variables.</p><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" className="mt-5 h-14 w-full rounded-3xl border border-line px-4 outline-none focus:border-blue-500" /><button onClick={login} className="mt-4 h-14 w-full rounded-3xl bg-blue-500 font-black text-white">Unlock</button>{error && <p className="mt-3 text-sm font-bold text-amber-600">{error}</p>}</div></main>;
}
