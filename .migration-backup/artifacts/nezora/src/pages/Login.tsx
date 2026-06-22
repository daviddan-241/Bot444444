import { useState } from 'react';
import { useLocation } from 'wouter';
import { GitBranch, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [, nav] = useLocation();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.ok) nav('/');
      else setError(d.message || 'Invalid token');
    } catch { setError('Connection failed. Is the API running?'); }
    setLoading(false);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#0A0F1E 0%,#1A2440 100%)' }}>
      <div className="w-full max-w-sm animate-rise">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 8px 32px rgba(10,132,255,0.4)' }}>
            <GitBranch size={24} color="white" />
          </div>
          <h1 className="text-[24px] font-800 text-white mb-1" style={{ letterSpacing: '-0.03em' }}>Danny's Cloud OS</h1>
          <p className="text-[13px]" style={{ color: '#8E9BAD' }}>Enter your admin token to continue</p>
        </div>

        <form onSubmit={submit} className="rounded-[22px] p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <div>
            <label className="text-[12px] font-600 block mb-2" style={{ color: '#8E9BAD' }}>Admin Token</label>
            <div className="relative">
              <Lock size={15} color="#8E9BAD" className="absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="Enter admin token…"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="field pl-10"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: 'white' }}
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[12px]" style={{ background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)' }}>
              <AlertCircle size={14} color="#FF453A" />
              <span className="text-[12.5px]" style={{ color: '#FF6B63' }}>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading || !token}
            className="w-full h-12 rounded-[14px] text-white font-700 text-[14px] flex items-center justify-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 16px rgba(10,132,255,0.4)' }}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Authenticating…</> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11.5px] mt-4" style={{ color: '#4A5568' }}>
          Set <code className="text-blue-400">ADMIN_TOKEN</code> environment variable to configure access
        </p>
      </div>
    </div>
  );
}
