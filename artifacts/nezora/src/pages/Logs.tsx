import { useEffect, useState, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { FileText, RefreshCw, Download, Search, Filter, Terminal } from 'lucide-react';

export default function Logs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function fetchLogs() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/system/logs`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || []); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchLogs(); }, []);

  const filtered = filter ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : logs;

  function download() {
    const blob = new Blob([filtered.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cloud-os-logs-${Date.now()}.txt`;
    a.click();
  }

  function lineColor(line: string) {
    if (/error|err|fail/i.test(line)) return '#FF453A';
    if (/warn/i.test(line)) return '#FF9F0A';
    if (/success|ok|done|deployed/i.test(line)) return '#30D158';
    if (/info|start/i.test(line)) return '#60A5FA';
    return '#CBD5E1';
  }

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Logs</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>{filtered.length} log entries</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} className="p-2.5 rounded-[12px] hover:bg-slate-100 transition">
              <RefreshCw size={15} color="#5E6E85" className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={download} className="flex items-center gap-2 px-3.5 py-2.5 rounded-[12px] text-[12.5px] font-600 border hover:bg-slate-50 transition" style={{ borderColor: '#E2E8F2', color: '#5E6E85' }}>
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#E2E8F2' }}>
            <Search size={13} color="#8E9BAD" />
            <input
              className="flex-1 bg-transparent border-none outline-none text-[13px]"
              placeholder="Filter logs…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ color: '#0A0F1E' }}
            />
            {filter && (
              <button onClick={() => setFilter('')} className="text-[11px] font-600 px-2 py-0.5 rounded-full" style={{ background: '#F0F3F8', color: '#5E6E85' }}>Clear</button>
            )}
          </div>

          {/* Log output */}
          <div className="log-block rounded-none" style={{ maxHeight: '60vh', overflowY: 'auto', borderRadius: 0 }}>
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <Terminal size={22} color="#3D4D63" className="mx-auto mb-2" />
                <div style={{ color: '#8E9BAD' }}>
                  {loading ? 'Loading logs…' : 'No logs found'}
                </div>
              </div>
            ) : filtered.map((line, i) => (
              <div key={i} style={{ color: lineColor(line), borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 2, marginBottom: 2 }}>
                <span style={{ color: '#4A5568', marginRight: 12, userSelect: 'none', fontSize: 11 }}>{String(i + 1).padStart(4, ' ')}</span>
                {line}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
