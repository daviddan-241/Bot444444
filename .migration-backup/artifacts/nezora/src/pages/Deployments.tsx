import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { GitBranch, RefreshCw, ExternalLink, CheckCircle2, XCircle, Clock, Rocket } from 'lucide-react';
import { Link } from 'wouter';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Deployments() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { load(); }, []);

  const allDeps = projects.flatMap((p: any) =>
    (p.deployments ?? []).map((d: any) => ({ ...d, projectName: p.name, projectId: p.id }))
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Shell title="Deployments">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Deployments</div>
            <div className="section-subtitle">{allDeps.length} total deployment{allDeps.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
            <Link href="/deploy" className="btn btn-primary btn-sm"><Rocket size={13} /> New Deploy</Link>
          </div>
        </div>

        {allDeps.length === 0 ? (
          <div className="card empty-state">
            <GitBranch size={40} className="empty-state-icon" />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No deployments yet</div>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 20 }}>Deploy an app to see the history here</div>
            <Link href="/deploy" className="btn btn-primary"><Rocket size={15} /> Deploy Now</Link>
          </div>
        ) : (
          <div className="card">
            <table className="data-table">
              <thead><tr><th>App</th><th>Source</th><th>Stack</th><th>Status</th><th>Deployed</th><th>URL</th></tr></thead>
              <tbody>
                {allDeps.map((d: any) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.projectName}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.source ?? '—'}</td>
                    <td>{d.stack ? <span className="pill pill-blue" style={{ fontSize: 11 }}>{d.stack}</span> : '—'}</td>
                    <td>
                      {d.status === 'success'
                        ? <span className="pill pill-green"><CheckCircle2 size={11} /> success</span>
                        : d.status === 'failed'
                        ? <span className="pill pill-red"><XCircle size={11} /> failed</span>
                        : <span className="pill pill-yellow"><Clock size={11} /> {d.status}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(d.createdAt).toLocaleString()}</td>
                    <td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ color: '#007AFF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}><ExternalLink size={12} /> Open</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
