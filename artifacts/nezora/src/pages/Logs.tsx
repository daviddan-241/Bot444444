import { useEffect, useState, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { FileText, RefreshCw, Download, Search, Trash2 } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

function LogLine({ line }: { line: string }) {
  const cls = line.includes('[ERR]') || line.toLowerCase().includes('error') ? 'log-err'
    : line.toLowerCase().includes('warn') ? 'log-info'
    : (line.includes('[DEPLOY]') || line.includes('[SYSTEM]') || line.includes('success')) ? 'log-ok'
    : '';
  return <div className={cls}>{line}</div>;
}

export default function Logs() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const base = BASE();

  const loadProcs = async () => {
    try {
      const r = await fetch(`${base}/api/system/processes`, { credentials: 'include' });
      const d = await r.json();
      setProcesses(d.processes ?? []);
      if (!selected && d.processes?.length > 0) setSelected(d.processes[0].id);
    } catch {}
  };

  const loadLogs = async (id: string) => {
    if (!id) return;
    try {
      const r = await fetch(`${base}/api/processes/${id}/logs?tail=200`, { credentials: 'include' });
      const d = await r.json();
      setLogs(d.logs ?? []);
    } catch {}
    if (autoScroll) setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  };

  useEffect(() => { loadProcs(); }, []);
  useEffect(() => {
    if (selected) {
      loadLogs(selected);
      const t = setInterval(() => loadLogs(selected), 3000);
      return () => clearInterval(t);
    }
  }, [selected]);

  const filtered = filter ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : logs;

  const download = () => {
    const blob = new Blob([filtered.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${selected}-logs.txt`; a.click();
  };

  return (
    <Shell title="Logs">
      <div className="animate-rise" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="section-title">Logs</div>
            <div className="section-subtitle">Real-time output from running processes</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={download} disabled={!logs.length}><Download size={13} /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setLogs([]); }}><Trash2 size={13} /></button>
          </div>
        </div>

        {/* Process selector */}
        <div className="card card-inner" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="field" style={{ flex: 1, minWidth: 200 }} value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">— Select a process —</option>
              {processes.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => selected && loadLogs(selected)}><RefreshCw size={13} /></button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ width: 14, height: 14 }} />
              Auto-scroll
            </label>
          </div>
        </div>

        {/* Filter */}
        <div className="card card-inner" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Search size={15} color="var(--text-tertiary)" />
            <input className="field field-sm" style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, height: 'auto' }} placeholder="Filter logs…" value={filter} onChange={e => setFilter(e.target.value)} />
            {filter && <button className="btn btn-secondary btn-sm" onClick={() => setFilter('')}>Clear</button>}
          </div>
        </div>

        {/* Log output */}
        <div className="card">
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', gap: 8, background: '#1C1C1E', borderRadius: '16px 16px 0 0' }}>
            <FileText size={13} color="#5AC8F5" />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8E8E93' }}>
              {selected ? processes.find(p => p.id === selected)?.name ?? selected : 'No process selected'} · {filtered.length} lines
            </span>
          </div>
          <div className="log-box" ref={logRef} style={{ maxHeight: 480, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            {!selected && <div style={{ color: '#5AC8F5' }}>Select a process above to view logs</div>}
            {selected && filtered.length === 0 && <div style={{ color: '#636366' }}>No log output yet — deploy an app to see logs</div>}
            {filtered.map((l, i) => <LogLine key={i} line={l} />)}
          </div>
        </div>
      </div>
    </Shell>
  );
}
