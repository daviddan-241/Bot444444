import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Link } from 'wouter';
import {
  Rocket, Box, Cpu, Server, Clock, ChevronRight, Zap, RefreshCw,
  Bot, Activity, BarChart2, ShieldCheck, Users, Code2, ChevronRight as Arrow
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

function StatCard({ label, value, sub, color = '#4A9BFF', icon: Icon }: any) {
  return (
    <div className="card card-inner" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={color} strokeWidth={2} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
      <div style={{ position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: `${color}10`, pointerEvents: 'none' }} />
    </div>
  );
}

function BarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
        <span>{label}</span><span style={{ color: 'var(--text-tertiary)' }}>{pct}%</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function StatusDot({ s }: { s: string }) {
  const cls: Record<string, string> = {
    running: 'dot-green dot-pulse', crashed: 'dot-red',
    stopped: 'dot-gray', starting: 'dot-yellow dot-pulse', restarting: 'dot-yellow dot-pulse'
  };
  return <span className={`stat-dot ${cls[s] ?? 'dot-gray'}`} />;
}

interface FeatCard { label: string; sub: string; href: string; icon: any; cls: string }

const FEATURE_CARDS: FeatCard[] = [
  { label: 'AI Assistant',    sub: 'Agent-mode coding',   href: '/ai',         icon: Bot,        cls: 'feat-card-purple' },
  { label: 'Deploy Center',   sub: 'Git · ZIP · Docker',  href: '/deploy',     icon: Rocket,     cls: 'feat-card-blue'   },
  { label: 'Analytics',       sub: 'Live monitoring',      href: '/monitoring', icon: BarChart2,  cls: 'feat-card-teal'   },
  { label: 'Security',        sub: 'Auth & access',        href: '/admin',      icon: ShieldCheck,cls: 'feat-card-pink'   },
];

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const base = BASE();

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [sr, pr, wr] = await Promise.all([
        fetch(`${base}/api/system/stats`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/projects`, { credentials: 'include' }).then(r => r.json()).catch(() => ({ projects: [] })),
        fetch(`${base}/api/system/workers`, { credentials: 'include' }).then(r => r.json()).catch(() => ({ workers: [] })),
      ]);
      if (sr) setStats(sr);
      setProjects((pr.projects ?? []).slice(0, 6));
      setWorkers(wr.workers ?? []);
    } catch {}
    if (manual) setRefreshing(false);
  };

  useEffect(() => { load(); const t = setInterval(() => load(), 10000); return () => clearInterval(t); }, []);

  const cpu = stats?.cpu ?? 0;
  const ram = stats?.mem?.percent ?? 0;
  const disk = stats?.disk?.percent ?? 0;
  const uptime = stats?.uptime?.pretty ?? '—';
  const running = stats?.processes?.running ?? 0;
  const totalProcs = stats?.processes?.total ?? 0;
  const workerActive = workers.filter((w: any) => w.status !== 'error').length;

  return (
    <Shell title="Dashboard">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Dashboard</div>
            <div className="section-subtitle">Real-time view of your cloud infrastructure</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <StatCard label="Running Apps" value={running} sub={`${totalProcs} deployed`} color="#34C759" icon={Rocket} />
          <StatCard label="CPU" value={`${cpu}%`} sub="Live reading" color="#4A9BFF" icon={Cpu} />
          <StatCard label="RAM" value={`${ram}%`} sub={stats?.mem ? `${stats.mem.usedMb} / ${stats.mem.totalMb} MB` : '—'} color="#7C5CE8" icon={Server} />
          <StatCard label="Uptime" value={uptime} sub="API server" color="#FF9500" icon={Clock} />
        </div>

        {/* System + Workers row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="card card-inner">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>System Resources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <BarRow label="CPU Usage" pct={cpu} color={cpu > 80 ? 'bar-red' : cpu > 55 ? 'bar-orange' : 'bar-blue'} />
              <BarRow label="RAM Usage" pct={ram} color={ram > 85 ? 'bar-red' : ram > 70 ? 'bar-orange' : 'bar-blue'} />
              <BarRow label="Disk /tmp" pct={disk} color={disk > 90 ? 'bar-red' : 'bar-green'} />
            </div>
          </div>
          <div className="card card-inner">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Workers</span>
              <span className="pill pill-blue" style={{ fontSize: 11 }}>{workerActive} active</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {workers.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Starting workers…</span>}
              {workers.slice(0, 5).map((w: any) => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span className={`stat-dot ${w.status === 'error' ? 'dot-red' : 'dot-green dot-pulse'}`} />
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{w.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{w.runs}×</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature grid — matches design */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {FEATURE_CARDS.map(f => {
            const Icon = f.icon;
            return (
              <Link key={f.href} href={f.href} className={`feat-card ${f.cls}`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 13, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color="#fff" strokeWidth={1.8} />
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Arrow size={14} color="rgba(255,255,255,0.8)" />
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{f.sub}</div>
              </Link>
            );
          })}
        </div>

        {/* Deployed Apps */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Deployed Apps</span>
            <Link href="/projects" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2 }}>
              All apps <ChevronRight size={13} />
            </Link>
          </div>
          {projects.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <Box size={28} style={{ opacity: .2, margin: '0 auto 12px', color: 'var(--text-tertiary)' }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No apps deployed yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Drop a ZIP or paste a repo URL to get started</div>
              <Link href="/deploy" className="btn btn-primary btn-sm"><Rocket size={13} /> Deploy Now</Link>
            </div>
          ) : projects.map((p: any) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(74,155,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Box size={15} color="var(--blue)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.framework ?? p.language ?? 'app'} · {new Date(p.createdAt ?? Date.now()).toLocaleDateString()}</div>
              </div>
              <StatusDot s={p.processStatus ?? p.status ?? 'stopped'} />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'capitalize', minWidth: 52 }}>{p.processStatus ?? p.status ?? 'stopped'}</span>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open</a>}
            </div>
          ))}
        </div>

      </div>
    </Shell>
  );
}
