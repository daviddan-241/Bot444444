import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';

export default function Limits() {
  const [token, setToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function check() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/real/limits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { if (token) check(); }, []);

  const rate = data?.github?.rate;
  const pct = rate ? Math.round((rate.remaining / rate.limit) * 100) : null;

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-3xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>API Limits</h1>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>Monitor provider rate limits to avoid service disruptions</p>
        </div>

        <div className="card p-5 mb-5">
          <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>GitHub Token</label>
          <div className="flex gap-3">
            <input className="field flex-1" type="password" placeholder="ghp_xxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} />
            <button onClick={check} disabled={loading || !token}
              className="flex items-center gap-2 px-4 rounded-[14px] text-[13px] font-700 text-white flex-shrink-0 transition"
              style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Gauge size={14} />}
              Check
            </button>
          </div>
        </div>

        {data && (
          <div className="space-y-4 animate-rise">
            {rate && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🐙</span>
                    <div>
                      <div className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>GitHub REST API</div>
                      <div className="text-[12px]" style={{ color: '#8E9BAD' }}>Core rate limit</div>
                    </div>
                  </div>
                  {(pct ?? 0) > 20
                    ? <CheckCircle2 size={18} color="#30D158" />
                    : <AlertTriangle size={18} color="#FF9F0A" />}
                </div>
                <div className="flex justify-between text-[12px] mb-2" style={{ color: '#5E6E85' }}>
                  <span>{rate.remaining.toLocaleString()} remaining</span>
                  <span>{rate.limit.toLocaleString()} limit</span>
                </div>
                <div className="metric-bar mb-3">
                  <div className="metric-bar-fill" style={{ width: `${pct}%`, background: (pct ?? 0) > 50 ? '#30D158' : (pct ?? 0) > 20 ? '#FF9F0A' : '#FF453A' }} />
                </div>
                <div className="text-[12px]" style={{ color: '#8E9BAD' }}>
                  Resets at {new Date(rate.reset * 1000).toLocaleTimeString()}
                </div>
              </div>
            )}

            {data.policies && (
              <div className="card p-5">
                <div className="text-[13px] font-700 mb-3" style={{ color: '#0A0F1E' }}>Ethical Limit Policies</div>
                {data.policies.map((p: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b last:border-0" style={{ borderColor: '#F0F3F8' }}>
                    <CheckCircle2 size={13} color="#30D158" className="mt-0.5 flex-shrink-0" />
                    <span className="text-[12.5px]" style={{ color: '#3D4D63' }}>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!data && !loading && (
          <div className="card p-8 text-center">
            <Gauge size={30} color="#CBD5E1" className="mx-auto mb-3" />
            <div className="text-[13.5px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No data yet</div>
            <div className="text-[12px]" style={{ color: '#8E9BAD' }}>Enter your GitHub token above and click Check</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
