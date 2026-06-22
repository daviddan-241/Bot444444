import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { Box, Plus, RefreshCw, Rocket, Globe, Trash2, ExternalLink, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/projects`);
      if (r.ok) { const d = await r.json(); setProjects(d.projects || []); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return;
    await fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Projects</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>{projects.length} project{projects.length !== 1 ? 's' : ''} registered</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2.5 rounded-[12px] hover:bg-slate-100 transition">
              <RefreshCw size={15} color="#5E6E85" />
            </button>
            <Link href="/deploy" className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              <Plus size={14} /> New Project
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="card p-12 text-center">
            <RefreshCw size={22} color="#CBD5E1" className="animate-spin mx-auto mb-3" />
            <div className="text-[13px]" style={{ color: '#8E9BAD' }}>Loading projects…</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-12 text-center">
            <Box size={32} color="#CBD5E1" className="mx-auto mb-3" />
            <div className="text-[14px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No projects yet</div>
            <div className="text-[13px] mb-4" style={{ color: '#8E9BAD' }}>Deploy your first project to see it here</div>
            <Link href="/deploy" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] text-[13px] font-700 text-white" style={{ background: '#0A84FF' }}>
              <Rocket size={13} /> Deploy now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map(p => {
              const latest = p.deployments?.[0];
              return (
                <div key={p.id} className="card p-5 card-hover">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: '#EEF6FF' }}>
                        <Box size={16} color="#0A84FF" />
                      </div>
                      <div>
                        <div className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>{p.name}</div>
                        <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{p.framework || 'Auto-detected'}</div>
                      </div>
                    </div>
                    {latest && <StatusPill status={latest.status} />}
                  </div>

                  {latest?.url && (
                    <a href={latest.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-[12px] font-500 mb-3 truncate" style={{ color: '#0A84FF' }}>
                      <Globe size={11} />
                      <span className="truncate">{latest.url}</span>
                      <ExternalLink size={10} />
                    </a>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: '#F0F3F8' }}>
                    <div className="text-[11.5px]" style={{ color: '#8E9BAD' }}>
                      {p.deployments?.length || 0} deployment{p.deployments?.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => deleteProject(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition">
                        <Trash2 size={13} color="#CBD5E1" />
                      </button>
                      <Link href="/deployments" className="flex items-center gap-1 text-[12px] font-600" style={{ color: '#0A84FF' }}>
                        Deploys <ChevronRight size={12} />
                      </Link>
                    </div>
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
