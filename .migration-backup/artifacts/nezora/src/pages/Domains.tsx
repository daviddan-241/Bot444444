import { Shell } from '@/components/Shell';
import { Globe, Plus, CheckCircle2, AlertTriangle, ExternalLink, Lock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Domains() {
  const [domains, setDomains] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/domains`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setDomains(d.domains || []); }
    } catch {}
    setLoading(false);
  }

  async function addDomain() {
    if (!newDomain.trim()) return;
    try {
      await fetch(`${BASE}/api/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim() }),
        credentials: 'include',
      });
      setNewDomain('');
      load();
    } catch {}
  }

  useEffect(() => { load(); }, []);

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-3xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Domains</h1>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>Custom domains, SSL certificates & DNS management</p>
        </div>

        {/* Add domain */}
        <div className="card p-5 mb-5">
          <div className="text-[13px] font-700 mb-3" style={{ color: '#0A0F1E' }}>Add Custom Domain</div>
          <div className="flex gap-3">
            <input className="field flex-1" placeholder="yourdomain.com" value={newDomain} onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()} />
            <button onClick={addDomain} className="flex items-center gap-2 px-4 rounded-[14px] text-[13px] font-700 text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              <Plus size={14} /> Add
            </button>
          </div>
          <p className="text-[11.5px] mt-2" style={{ color: '#8E9BAD' }}>Point your domain's A record to this server's IP, then add it here for automatic SSL.</p>
        </div>

        {/* Domain list */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-3 border-b" style={{ borderColor: '#E2E8F2' }}>
            <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>Active Domains</span>
          </div>
          {loading ? (
            <div className="p-8 text-center"><RefreshCw size={18} color="#CBD5E1" className="animate-spin mx-auto" /></div>
          ) : domains.length === 0 ? (
            <div className="p-8 text-center">
              <Globe size={28} color="#CBD5E1" className="mx-auto mb-2" />
              <div className="text-[13px]" style={{ color: '#8E9BAD' }}>No custom domains yet</div>
            </div>
          ) : domains.map((d, i) => (
            <div key={d.domain} className={`flex items-center gap-4 px-5 py-4 ${i < domains.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
              <Globe size={16} color="#0A84FF" />
              <div className="flex-1">
                <div className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>{d.domain}</div>
                {d.project && <div className="text-[11.5px]" style={{ color: '#8E9BAD' }}>→ {d.project}</div>}
              </div>
              <div className="flex items-center gap-2">
                {d.ssl ? <CheckCircle2 size={14} color="#30D158" /> : <AlertTriangle size={14} color="#FF9F0A" />}
                <Lock size={13} color={d.ssl ? '#30D158' : '#CBD5E1'} />
              </div>
            </div>
          ))}
        </div>

        {/* DNS guide */}
        <div className="card p-5" style={{ background: 'linear-gradient(135deg,rgba(10,132,255,0.04),rgba(94,92,230,0.04))', border: '1.5px solid rgba(10,132,255,0.12)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Lock size={15} color="#0A84FF" />
            <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>SSL & DNS Guide</span>
          </div>
          <ol className="space-y-2 text-[12.5px]" style={{ color: '#5E6E85' }}>
            <li>1. Get your server's IP from the Infrastructure page</li>
            <li>2. Add an A record in your DNS provider pointing to that IP</li>
            <li>3. Add the domain here — SSL is provisioned automatically via Let's Encrypt</li>
            <li>4. Propagation takes up to 48h (usually minutes)</li>
          </ol>
        </div>
      </div>
    </Shell>
  );
}
