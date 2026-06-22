import { useEffect, useState, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { Activity, RefreshCw, TrendingUp, Cpu, HardDrive, Wifi, Clock } from 'lucide-react';

interface Stats { cpu: number; ram: number; storage: number; uptime: string; network?: { rx: number; tx: number }; projects: number; deployments: number; }

export default function Monitoring() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function fetchStats() {
    try {
      const r = await fetch(`${BASE}/api/system/stats`);
      if (r.ok) {
        const d = await r.json();
        setStats(d);
        setHistory(p => [...p.slice(-29), d]);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchStats(); const t = setInterval(fetchStats, 4000); return () => clearInterval(t); }, []);

  const metricCards = [
    { label: 'CPU Usage', value: stats?.cpu ?? 0, unit: '%', color: '#0A84FF', icon: Cpu, bg: '#EEF6FF' },
    { label: 'RAM Usage', value: stats?.ram ?? 0, unit: '%', color: '#5E5CE6', icon: HardDrive, bg: '#F0EFFE' },
    { label: 'Storage', value: stats?.storage ?? 0, unit: '%', color: '#30D158', icon: HardDrive, bg: '#EDFAF2' },
    { label: 'Network RX', value: stats?.network?.rx ?? 0, unit: 'KB/s', color: '#FF9F0A', icon: Wifi, bg: '#FFF8EC' },
  ];

  function Sparkline({ data, color }: { data: number[]; color: string }) {
    const max = Math.max(...data, 1);
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 80}`).join(' ');
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-12">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Monitoring</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Live system metrics · updates every 4s</p>
          </div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#30D158' }}>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot inline-block" />
            Live
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {metricCards.map(m => {
            const Icon = m.icon;
            const histData = history.map(h => {
              if (m.label === 'CPU Usage') return h.cpu;
              if (m.label === 'RAM Usage') return h.ram;
              if (m.label === 'Storage') return h.storage;
              return h.network?.rx ?? 0;
            });
            return (
              <div key={m.label} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: m.bg }}>
                    <Icon size={15} style={{ color: m.color }} />
                  </div>
                  <div className="text-[22px] font-800" style={{ color: '#0A0F1E', letterSpacing: '-0.02em' }}>
                    {m.value}<span className="text-[12px] font-500 ml-0.5" style={{ color: '#8E9BAD' }}>{m.unit}</span>
                  </div>
                </div>
                <div className="text-[12px] font-500 mb-1" style={{ color: '#5E6E85' }}>{m.label}</div>
                {histData.length > 1 && <Sparkline data={histData} color={m.color} />}
              </div>
            );
          })}
        </div>

        {/* Uptime & system */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} color="#0A84FF" />
              <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>System Uptime</span>
            </div>
            <div className="text-[32px] font-800" style={{ color: '#0A0F1E', letterSpacing: '-0.03em' }}>
              {stats?.uptime ?? '—'}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: '#30D158' }}>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot inline-block" />
              All systems operational
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} color="#5E5CE6" />
              <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>Platform Stats</span>
            </div>
            <div className="space-y-3">
              {[
                ['Projects', stats?.projects ?? '—'],
                ['Total Deployments', stats?.deployments ?? '—'],
                ['TX', `${stats?.network?.tx ?? 0} KB/s`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-[12.5px]" style={{ color: '#5E6E85' }}>{k}</span>
                  <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Resource bars */}
        <div className="card p-5">
          <div className="text-[13px] font-700 mb-4" style={{ color: '#0A0F1E' }}>Resource Overview</div>
          <div className="space-y-4">
            {[
              { label: 'CPU', value: stats?.cpu ?? 0, color: '#0A84FF' },
              { label: 'RAM', value: stats?.ram ?? 0, color: '#5E5CE6' },
              { label: 'Storage', value: stats?.storage ?? 0, color: '#30D158' },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[12.5px] font-500" style={{ color: '#5E6E85' }}>{m.label}</span>
                  <span className="text-[12.5px] font-700" style={{ color: '#0A0F1E' }}>{m.value}%</span>
                </div>
                <div className="metric-bar" style={{ height: 8 }}>
                  <div className="metric-bar-fill" style={{ width: `${m.value}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
