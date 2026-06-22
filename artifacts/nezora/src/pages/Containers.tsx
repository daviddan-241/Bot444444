import { Shell } from '@/components/Shell';
import { Cpu, Plus, RefreshCw, Play, Square, Trash2, Terminal } from 'lucide-react';
import { StatusPill } from '@/components/StatusPill';
import { useEffect, useState } from 'react';

export default function Containers() {
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/containers`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setContainers(d.containers || []); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Containers</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Docker container management</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2.5 rounded-[12px] hover:bg-slate-100 transition">
              <RefreshCw size={15} color="#5E6E85" className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              <Plus size={14} /> New Container
            </button>
          </div>
        </div>

        {containers.length === 0 ? (
          <div className="card p-12 text-center">
            <Cpu size={32} color="#CBD5E1" className="mx-auto mb-3" />
            <div className="text-[14px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No containers running</div>
            <div className="text-[13px] mb-4" style={{ color: '#8E9BAD' }}>
              Deploy a project with Docker to see containers here.<br />
              Docker socket required for container management.
            </div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {containers.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition ${i < containers.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[13px] font-700 truncate" style={{ color: '#0A0F1E' }}>{c.name}</div>
                  <div className="text-[12px] font-mono truncate" style={{ color: '#8E9BAD' }}>{c.image}</div>
                </div>
                <StatusPill status={c.status} />
                <div className="flex items-center gap-2">
                  <button className="p-1.5 rounded-[8px] hover:bg-green-50 transition"><Play size={13} color="#30D158" /></button>
                  <button className="p-1.5 rounded-[8px] hover:bg-slate-100 transition"><Square size={13} color="#8E9BAD" /></button>
                  <button className="p-1.5 rounded-[8px] hover:bg-slate-100 transition"><Terminal size={13} color="#8E9BAD" /></button>
                  <button className="p-1.5 rounded-[8px] hover:bg-red-50 transition"><Trash2 size={13} color="#FF453A" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
