import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Cpu, RefreshCw, Play, Square, RotateCcw, Trash2, Terminal, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = { running: 'pill pill-green', crashed: 'pill pill-red', stopped: 'pill pill-gray', starting: 'pill pill-yellow', restarting: 'pill pill-yellow' };
  return <span className={map[s] ?? 'pill pill-gray'}><span className={`stat-dot ${s === 'running' ? 'dot-green dot-pulse' : s === 'crashed' ? 'dot-red' : 'dot-gray'}`} />{s}</span>;
}

export default function Containers() {
  const [procs, setProcs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const base = BASE();

  const load = async () => {
    try {
      const r = await fetch(`${base}/api/system/processes`, { credentials: 'include' });
      const d = await r.json();
      setProcs(d.processes ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const action = async (id: string, act: 'start' | 'stop' | 'restart' | 'delete') => {
    setActing(id);
    try {
      if (act === 'delete') {
        await fetch(`${base}/api/processes/${id}`, { method: 'DELETE', credentials: 'include' });
      } else {
        await fetch(`${base}/api/processes/${id}/${act}`, { method: 'POST', credentials: 'include' });
      }
      setTimeout(load, 800);
    } catch {}
    setActing(null);
  };

  const repair = async (id: string) => {
    setActing(id);
    try {
      await fetch(`${base}/api/deploy/repair`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      setTimeout(load, 2000);
    } catch {}
    setActing(null);
  };

  return (
    <Shell title="Containers">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Running Processes</div>
            <div className="section-subtitle">Live view of all spawned app processes</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {procs.length === 0 && !loading ? (
          <div className="card empty-state">
            <Cpu size={40} className="empty-state-icon" />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No processes running</div>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Deploy an app and it will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {procs.map((p: any) => {
              const isActing = acting === p.id;
              return (
                <div key={p.id} className="card card-inner" style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: p.status === 'crashed' ? '#FEE2E2' : '#EBF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {p.status === 'crashed' ? <AlertTriangle size={18} color="#FF3B30" /> : <Cpu size={18} color="#007AFF" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      <StatusPill s={p.status} />
                      {p.language && <span className="pill pill-purple" style={{ fontSize: 10 }}>{p.language}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                      {p.pid && <span>PID {p.pid}</span>}
                      {p.port > 0 && <span>Port {p.port}</span>}
                      {p.restarts > 0 && <span style={{ color: '#FF9500' }}>{p.restarts} restart{p.restarts !== 1 ? 's' : ''}</span>}
                      {p.startedAt && <span>Started {new Date(p.startedAt).toLocaleTimeString()}</span>}
                    </div>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#007AFF', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                        {p.url}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {p.status === 'crashed' && (
                      <button className="btn btn-sm" style={{ background: '#FFF3E0', color: '#FF6D00', border: '1px solid #FFB74D' }} disabled={isActing} onClick={() => repair(p.id)} title="Auto-repair">
                        <AlertTriangle size={12} /> Repair
                      </button>
                    )}
                    {p.status !== 'running' && (
                      <button className="btn btn-secondary btn-sm" title="Start" disabled={isActing} onClick={() => action(p.id, 'start')}><Play size={12} /></button>
                    )}
                    {p.status === 'running' && (
                      <button className="btn btn-secondary btn-sm" title="Stop" disabled={isActing} onClick={() => action(p.id, 'stop')}><Square size={12} /></button>
                    )}
                    <button className="btn btn-secondary btn-sm" title="Restart" disabled={isActing} onClick={() => action(p.id, 'restart')}><RotateCcw size={12} /></button>
                    <Link href="/logs" className="btn btn-secondary btn-sm"><Terminal size={12} /></Link>
                    <button className="btn btn-danger btn-sm" disabled={isActing} onClick={() => { if (confirm(`Remove ${p.name}?`)) action(p.id, 'delete'); }}><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
