import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Box, Plus, RefreshCw, Rocket, Trash2, ExternalLink, Play, Square, RotateCcw, Terminal } from 'lucide-react';
import { Link } from 'wouter';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = { running: 'pill pill-green', crashed: 'pill pill-red', stopped: 'pill pill-gray', starting: 'pill pill-yellow', restarting: 'pill pill-yellow' };
  return <span className={map[s] ?? 'pill pill-gray'}><span className={`stat-dot ${s === 'running' ? 'dot-green dot-pulse' : s === 'crashed' ? 'dot-red' : 'dot-gray'}`} />{s}</span>;
}

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const base = BASE();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/projects`, { credentials: 'include' });
      const d = await r.json();
      setProjects(d.projects ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const action = async (id: string, slug: string, act: 'start' | 'stop' | 'restart' | 'delete') => {
    setActing(id);
    try {
      if (act === 'delete') {
        await fetch(`${base}/api/projects/${id}`, { method: 'DELETE', credentials: 'include' });
        await load();
      } else {
        await fetch(`${base}/api/processes/${slug}/${act}`, { method: 'POST', credentials: 'include' });
        setTimeout(load, 1500);
      }
    } catch {}
    setActing(null);
  };

  return (
    <Shell title="Projects">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Projects</div>
            <div className="section-subtitle">{projects.length} app{projects.length !== 1 ? 's' : ''} deployed</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
            <Link href="/deploy" className="btn btn-primary btn-sm"><Rocket size={13} /> Deploy New</Link>
          </div>
        </div>

        {projects.length === 0 && !loading ? (
          <div className="card empty-state">
            <Box size={40} className="empty-state-icon" />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 20 }}>Deploy your first app to get started</div>
            <Link href="/deploy" className="btn btn-primary"><Rocket size={15} /> Deploy Now</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {projects.map((p: any) => {
              const status = p.processStatus ?? p.status ?? 'stopped';
              const isActing = acting === p.id;
              return (
                <div key={p.id} className="card card-inner" style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EBF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Box size={20} color="#007AFF" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                      <StatusPill s={status} />
                      {p.framework && <span className="pill pill-blue" style={{ fontSize: 11 }}>{p.framework}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                      {p.language ?? 'app'} · Deployed {new Date(p.createdAt ?? Date.now()).toLocaleDateString()}
                      {p.port ? ` · port ${p.port}` : ''}
                    </div>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#007AFF', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <ExternalLink size={11} /> {p.url}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap' }}>
                    {status !== 'running' && status !== 'starting' && (
                      <button className="btn btn-secondary btn-sm" title="Start" disabled={isActing} onClick={() => action(p.id, p.slug ?? p.name, 'start')}>
                        <Play size={13} />
                      </button>
                    )}
                    {(status === 'running' || status === 'starting') && (
                      <button className="btn btn-secondary btn-sm" title="Stop" disabled={isActing} onClick={() => action(p.id, p.slug ?? p.name, 'stop')}>
                        <Square size={13} />
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" title="Restart" disabled={isActing} onClick={() => action(p.id, p.slug ?? p.name, 'restart')}>
                      <RotateCcw size={13} />
                    </button>
                    <Link href="/logs" className="btn btn-secondary btn-sm" title="Logs"><Terminal size={13} /></Link>
                    <button className="btn btn-danger btn-sm" title="Delete" disabled={isActing} onClick={() => { if (confirm(`Delete ${p.name}?`)) action(p.id, p.slug ?? p.name, 'delete'); }}>
                      <Trash2 size={13} />
                    </button>
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
