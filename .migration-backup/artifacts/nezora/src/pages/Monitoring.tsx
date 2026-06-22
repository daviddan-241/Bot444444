import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Activity, RefreshCw, Cpu, Server, HardDrive, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

function MiniChart({ data, color = '#007AFF' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 120; const h = 40;
  const pts = data.slice(-30).map((v, i, arr) => `${(i / (arr.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color, chart, pct }: any) {
  return (
    <div className="card card-inner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={color} strokeWidth={2} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        {chart && <MiniChart data={chart} color={color} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
      {pct !== undefined && (
        <div className="bar-track" style={{ marginTop: 10 }}>
          <div className={`bar-fill ${pct > 85 ? 'bar-red' : pct > 65 ? 'bar-orange' : 'bar-blue'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function Monitoring() {
  const [stats, setStats] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [health, setHealth] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const base = BASE();

  const load = async () => {
    try {
      const [sr, wr, hr] = await Promise.all([
        fetch(`${base}/api/system/stats`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/system/workers`, { credentials: 'include' }).then(r => r.json()).catch(() => ({ workers: [] })),
        fetch(`${base}/api/system/health`, { credentials: 'include' }).then(r => r.json()).catch(() => ({ health: {} })),
      ]);
      if (sr) { setStats(sr); setMetrics(sr.metrics ?? []); }
      setWorkers(wr.workers ?? []);
      setHealth(hr.health ?? {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const cpuHistory = metrics.map((m: any) => m.cpu);
  const ramHistory = metrics.map((m: any) => m.ram);

  return (
    <Shell title="Monitoring">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Monitoring</div>
            <div className="section-subtitle">Live system metrics — updates every 8 seconds</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <MetricCard label="CPU" value={`${stats?.cpu ?? 0}%`} sub="Real-time" icon={Cpu} color="#007AFF" chart={cpuHistory} pct={stats?.cpu} />
          <MetricCard label="RAM" value={`${stats?.mem?.percent ?? 0}%`} sub={stats?.mem ? `${stats.mem.usedMb} / ${stats.mem.totalMb} MB` : '—'} icon={Server} color="#5856D6" chart={ramHistory} pct={stats?.mem?.percent} />
          <MetricCard label="Disk" value={`${stats?.disk?.percent ?? 0}%`} sub={stats?.disk ? `${stats.disk.usedMb} / ${stats.disk.totalMb} MB` : '—'} icon={HardDrive} color="#34C759" pct={stats?.disk?.percent} />
          <MetricCard label="Uptime" value={stats?.uptime?.pretty ?? '—'} sub="Since last restart" icon={Clock} color="#FF9500" />
        </div>

        {/* Processes summary */}
        <div className="card card-inner" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Process Health</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {[
              { label: 'Running', value: stats?.processes?.running ?? 0, color: '#34C759' },
              { label: 'Crashed', value: stats?.processes?.crashed ?? 0, color: '#FF3B30' },
              { label: 'Stopped', value: stats?.processes?.stopped ?? 0, color: '#C6C6C8' },
              { label: 'Total', value: stats?.processes?.total ?? 0, color: '#007AFF' },
            ].map(m => (
              <div key={m.label} style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg)', borderRadius: 10 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Workers */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={15} color="#007AFF" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Background Workers ({workers.length})</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Worker</th><th>Type</th><th>Status</th><th>Runs</th><th>Errors</th><th>Last Run</th></tr></thead>
            <tbody>
              {workers.map((w: any) => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td><span className="pill pill-blue" style={{ fontSize: 11 }}>{w.type}</span></td>
                  <td>
                    <span className={`pill ${w.status === 'error' ? 'pill-red' : w.status === 'running' ? 'pill-yellow' : 'pill-green'}`}>
                      <span className={`stat-dot ${w.status === 'error' ? 'dot-red' : 'dot-green dot-pulse'}`} />
                      {w.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-tertiary)' }}>{w.runs}</td>
                  <td style={{ color: w.errors > 0 ? '#FF3B30' : 'var(--text-tertiary)' }}>{w.errors}</td>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{w.lastRun ? new Date(w.lastRun).toLocaleTimeString() : '—'}</td>
                </tr>
              ))}
              {workers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32 }}>No workers running yet — start the API server</td></tr>}
            </tbody>
          </table>
        </div>

        {/* App health checks */}
        {Object.keys(health).length > 0 && (
          <div className="card card-inner">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>App Health Checks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(health).map(([id, h]: any) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  {h.ok ? <CheckCircle2 size={16} color="#34C759" /> : <AlertTriangle size={16} color="#FF3B30" />}
                  <span style={{ flex: 1, fontWeight: 500 }}>{id}</span>
                  {h.latency && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{h.latency}ms</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{h.checkedAt ? new Date(h.checkedAt).toLocaleTimeString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
