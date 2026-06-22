import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { Rocket, Box, Activity, HardDrive, Globe, Zap, ArrowRight, Clock, CheckCircle2, XCircle, RefreshCw, Database } from 'lucide-react';

interface SystemStats { cpu: number; ram: number; storage: number; uptime: string; projects: number; deployments: number; }

export default function Home() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [deploys, setDeploys] = useState<any[]>([]);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    try {
      const [sr, pr] = await Promise.all([
        fetch(`${BASE}/api/system/stats`),
        fetch(`${BASE}/api/projects`),
      ]);
      if (sr.ok) setStats(await sr.json());
      if (pr.ok) {
        const d = await pr.json();
        setDeploys((d.projects || []).flatMap((p: any) =>
          (p.deployments || []).slice(0, 2).map((dep: any) => ({ ...dep, projectName: p.name }))
        ).slice(0, 6));
      }
    } catch {}
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      const BASE2 = import.meta.env.BASE_URL.replace(/\/$/, '');
      fetch(`${BASE2}/api/system/stats`).then(r => r.ok && r.json().then(setStats)).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const metrics = [
    { label: 'CPU', value: stats?.cpu ?? 0, color: '#0A84FF' },
    { label: 'RAM', value: stats?.ram ?? 0, color: '#5E5CE6' },
    { label: 'Storage', value: stats?.storage ?? 0, color: '#30D158' },
  ];

  const statCards = [
    { label: 'Projects', value: stats?.projects ?? '—', icon: Box, color: '#0A84FF' },
    { label: 'Deployments', value: stats?.deployments ?? '—', icon: Rocket, color: '#5E5CE6' },
    { label: 'Uptime', value: stats?.uptime ?? '—', icon: Activity, color: '#30D158' },
    { label: 'Databases', value: '0', icon: Database, color: '#FF9F0A' },
  ];

  const quickActions = [
    { label: 'New Deployment', sub: 'Git, ZIP or Docker', href: '/deploy', icon: Rocket, color: '#0A84FF' },
    { label: 'Projects', sub: 'All your apps', href: '/projects', icon: Box, color: '#5E5CE6' },
    { label: 'Monitoring', sub: 'Live health & metrics', href: '/monitoring', icon: Activity, color: '#30D158' },
    { label: 'Domains', sub: 'Custom URLs & SSL', href: '/domains', icon: Globe, color: '#FF9F0A' },
    { label: 'AI Assistant', sub: 'Analyze & fix issues', href: '/ai', icon: Zap, color: '#FF453A' },
    { label: 'Templates', sub: 'One-click starters', href: '/templates', icon: HardDrive, color: '#BF5AF2' },
  ];

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[24px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>
            Welcome back 👋
          </h1>
          <p className="text-[14px]" style={{ color: '#5E6E85' }}>Danny's Cloud OS — your private infrastructure control plane.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {statCards.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-500" style={{ color: '#8E9BAD' }}>{s.label}</span>
                  <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: `${s.color}18` }}>
                    <Icon size={14} style={{ color: s.color }} />
                  </div>
                </div>
                <div className="text-[22px] font-800" style={{ color: '#0A0F1E', letterSpacing: '-0.02em' }}>{String(s.value)}</div>
              </div>
            );
          })}
        </div>

        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>System Resources</span>
            <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
              <RefreshCw size={12} color="#8E9BAD" />
            </button>
          </div>
          <div className="space-y-3">
            {metrics.map(m => (
              <div key={m.label} className="flex items-center gap-3">
                <span className="text-[12px] font-500 w-14" style={{ color: '#5E6E85' }}>{m.label}</span>
                <div className="flex-1 metric-bar">
                  <div className="metric-bar-fill" style={{ width: `${m.value}%`, background: m.color }} />
                </div>
                <span className="text-[12px] font-700 w-8 text-right" style={{ color: '#0A0F1E' }}>{m.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <h2 className="text-[11px] font-700 mb-3 uppercase tracking-widest" style={{ color: '#8E9BAD' }}>Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map(a => {
              const Icon = a.icon;
              return (
                <Link key={a.href} href={a.href} className="card card-hover p-4 flex items-center gap-3 no-underline">
                  <div className="w-10 h-10 rounded-[13px] flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}15` }}>
                    <Icon size={18} style={{ color: a.color }} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-[13px] font-700 truncate" style={{ color: '#0A0F1E' }}>{a.label}</div>
                    <div className="text-[12px] truncate" style={{ color: '#8E9BAD' }}>{a.sub}</div>
                  </div>
                  <ArrowRight size={13} color="#CBD5E1" />
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-700 uppercase tracking-widest" style={{ color: '#8E9BAD' }}>Recent Deployments</h2>
            <Link href="/deployments" className="text-[12px] font-600" style={{ color: '#0A84FF' }}>View all →</Link>
          </div>
          <div className="card overflow-hidden">
            {deploys.length === 0 ? (
              <div className="p-8 text-center">
                <Rocket size={28} color="#CBD5E1" className="mx-auto mb-3" />
                <div className="text-[13.5px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No deployments yet</div>
                <div className="text-[12px] mb-4" style={{ color: '#8E9BAD' }}>Deploy your first project to get started</div>
                <Link href="/deploy" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] text-[13px] font-700 text-white" style={{ background: '#0A84FF' }}>
                  <Rocket size={13} /> Deploy now
                </Link>
              </div>
            ) : deploys.map((d, i) => (
              <div key={d.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < deploys.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
                <div className="flex-shrink-0">
                  {d.status === 'success' ? <CheckCircle2 size={15} color="#30D158" /> :
                   d.status === 'failed' ? <XCircle size={15} color="#FF453A" /> :
                   <RefreshCw size={15} color="#FF9F0A" />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[13px] font-700 truncate" style={{ color: '#0A0F1E' }}>{d.projectName}</div>
                  {d.url && <div className="text-[11.5px] truncate" style={{ color: '#8E9BAD' }}>{d.url}</div>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusPill status={d.status} />
                  <span className="text-[11px] hidden sm:block" style={{ color: '#8E9BAD' }}>
                    <Clock size={11} className="inline mr-1" />{new Date(d.createdAt || d.time).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
