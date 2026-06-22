import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { Rocket, RefreshCw, ExternalLink, Trash2, RotateCcw, Clock, Globe } from 'lucide-react';
import { Link } from 'wouter';

export default function Deployments() {
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

  const allDeps = projects.flatMap(p => (p.deployments || []).map((d: any) => ({ ...d, projectName: p.name, projectId: p.id })));

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Deployments</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>{allDeps.length} total deployments across {projects.length} projects</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2.5 rounded-[12px] hover:bg-slate-100 transition" title="Refresh">
              <RefreshCw size={15} color="#5E6E85" />
            </button>
            <Link href="/deploy" className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              <Rocket size={14} /> New Deploy
            </Link>
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={22} color="#CBD5E1" className="animate-spin mx-auto mb-3" />
              <div className="text-[13px]" style={{ color: '#8E9BAD' }}>Loading deployments…</div>
            </div>
          ) : allDeps.length === 0 ? (
            <div className="p-12 text-center">
              <Rocket size={32} color="#CBD5E1" className="mx-auto mb-3" />
              <div className="text-[14px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No deployments yet</div>
              <div className="text-[13px] mb-4" style={{ color: '#8E9BAD' }}>Your deployment history will appear here</div>
              <Link href="/deploy" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] text-[13px] font-700 text-white" style={{ background: '#0A84FF' }}>
                <Rocket size={13} /> Deploy your first project
              </Link>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b" style={{ borderColor: '#E2E8F2' }}>
                <div className="col-span-4 text-[11px] font-700 uppercase tracking-wider" style={{ color: '#8E9BAD' }}>Project</div>
                <div className="col-span-3 text-[11px] font-700 uppercase tracking-wider" style={{ color: '#8E9BAD' }}>Status</div>
                <div className="col-span-3 text-[11px] font-700 uppercase tracking-wider" style={{ color: '#8E9BAD' }}>URL</div>
                <div className="col-span-2 text-[11px] font-700 uppercase tracking-wider" style={{ color: '#8E9BAD' }}>Date</div>
              </div>
              {allDeps.map((d, i) => (
                <div key={d.id} className={`grid grid-cols-12 gap-4 px-5 py-4 items-center ${i < allDeps.length - 1 ? 'border-b' : ''} hover:bg-slate-50 transition`} style={{ borderColor: '#E2E8F2' }}>
                  <div className="col-span-4 overflow-hidden">
                    <div className="text-[13px] font-700 truncate" style={{ color: '#0A0F1E' }}>{d.projectName}</div>
                    <div className="text-[11.5px] font-500 font-mono truncate" style={{ color: '#8E9BAD' }}>{d.id?.slice(0, 12)}…</div>
                  </div>
                  <div className="col-span-3">
                    <StatusPill status={d.status} />
                  </div>
                  <div className="col-span-3 overflow-hidden">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] font-500 truncate" style={{ color: '#0A84FF' }}>
                        <Globe size={11} />
                        <span className="truncate">{d.url.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink size={10} />
                      </a>
                    ) : <span className="text-[12px]" style={{ color: '#CBD5E1' }}>—</span>}
                  </div>
                  <div className="col-span-2 flex items-center gap-1 text-[11.5px]" style={{ color: '#8E9BAD' }}>
                    <Clock size={11} />
                    {new Date(d.createdAt || d.time || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
