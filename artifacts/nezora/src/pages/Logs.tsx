import { useEffect, useState, useRef, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import {
  FileText, Download, Search, Trash2, Wifi, WifiOff,
  RotateCw, Square, ExternalLink, ChevronDown, Activity
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface ManagedProcess {
  id: string; name: string; status: string; port: number;
  restarts: number; startedAt?: string; url?: string;
  framework?: string; language?: string;
}

const STATUS_COLOR: Record<string, string> = {
  running: '#34C759', starting: '#FF9F0A', restarting: '#FF9F0A',
  crashed: '#FF3B30', stopped: '#8E8E93',
};

function LogLine({ line }: { line: string }) {
  const isErr = /(\[ERR\]|error|Error|ENOENT|EADDRINUSE|fatal)/i.test(line) && !/✅/.test(line);
  const isOk  = /✅|success|done|live|started|listening|ready/i.test(line) && !isErr;
  const isWarn = /warn|⚠️/i.test(line);
  const isInfo = /📦|🔨|📡|📂|🔍|🚀|INFO|info/.test(line);
  const color = isErr ? '#FF3B30' : isOk ? '#34C759' : isWarn ? '#FF9F0A' : isInfo ? '#5AC8F5' : '#c9c9c9';
  return (
    <div style={{ color, fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.6, padding: '1px 0', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
      {line}
    </div>
  );
}

export default function Logs() {
  const base = BASE();
  const [procs, setProcs] = useState<ManagedProcess[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef  = useRef<EventSource | null>(null);
  const mainEsRef = useRef<EventSource | null>(null);

  // ── Main SSE: get real-time process list ────────────────────────────────────
  useEffect(() => {
    let es: EventSource;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource(`${base}/api/real/events/stream`, { withCredentials: true });

      es.addEventListener('init', (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setProcs(d.processes ?? []);
        setConnected(true);
      });
      es.addEventListener('process', (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setProcs(d.processes ?? []);
      });
      es.onerror = () => {
        setConnected(false);
        es.close();
        retry = setTimeout(connect, 3000);
      };
    };

    connect();
    mainEsRef.current = es!;
    return () => { es?.close(); clearTimeout(retry); };
  }, [base]);

  // ── Per-process SSE log stream ──────────────────────────────────────────────
  const openStream = useCallback((id: string) => {
    esRef.current?.close();
    setLines([]);
    setStreaming(true);

    const es = new EventSource(`${base}/api/real/processes/${id}/logs/stream`, { withCredentials: true });

    es.onmessage = (e: MessageEvent) => {
      const { line } = JSON.parse(e.data);
      setLines(prev => {
        const next = [...prev.slice(-999), line];
        if (autoScroll) setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 20);
        return next;
      });
    };
    es.onerror = () => { setStreaming(false); };
    esRef.current = es;
  }, [base, autoScroll]);

  useEffect(() => {
    if (selected) openStream(selected);
    return () => { esRef.current?.close(); };
  }, [selected]);

  useEffect(() => () => { esRef.current?.close(); mainEsRef.current?.close(); }, []);

  const filtered = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  const download = () => {
    const blob = new Blob([filtered.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selected || 'logs'}-${Date.now()}.txt`;
    a.click();
  };

  const doAction = async (url: string, method = 'POST') => {
    await fetch(`${base}${url}`, { method, credentials: 'include' });
  };

  const proc = procs.find(p => p.id === selected);

  return (
    <Shell title="Logs">
      <div className="animate-rise" style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="section-title">Live Logs</div>
            <div className="section-subtitle">Real-time stdout/stderr from your deployed apps</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: connected ? '#34C75915' : '#FF3B3015', border: `1px solid ${connected ? '#34C75940' : '#FF3B3040'}` }}>
              {connected
                ? <><Wifi size={12} color="#34C759" /><span style={{ fontSize: 11, color: '#34C759', fontWeight: 600 }}>Live</span></>
                : <><WifiOff size={12} color="#FF3B30" /><span style={{ fontSize: 11, color: '#FF3B30', fontWeight: 600 }}>Connecting…</span></>}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={download} disabled={!lines.length} title="Download logs">
              <Download size={13} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setLines([])} title="Clear">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* App selector + controls row */}
        <div className="card card-inner" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
            <Activity size={14} color="var(--text-tertiary)" />
            <select
              className="field"
              style={{ flex: 1 }}
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">— Select a running app —</option>
              {procs.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.status} {p.restarts > 0 ? `(↺ ${p.restarts})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={13} color="var(--text-tertiary)" style={{ flexShrink: 0, marginLeft: -30, pointerEvents: 'none' }} />
          </div>

          {/* Action buttons for selected process */}
          {proc && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {proc.url && (
                <a href={proc.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" title="Open app">
                  <ExternalLink size={13} />
                </a>
              )}
              <button className="btn btn-secondary btn-sm" title="Restart app"
                onClick={() => doAction(`/api/real/processes/${proc.id}/restart`)}>
                <RotateCw size={13} />
              </button>
              <button className="btn btn-secondary btn-sm" title="Stop app" style={{ color: '#FF3B30' }}
                onClick={() => doAction(`/api/real/processes/${proc.id}`, 'DELETE')}>
                <Square size={13} />
              </button>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ width: 14, height: 14 }} />
            Auto-scroll
          </label>
        </div>

        {/* Search/filter bar */}
        <div className="card card-inner" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Search size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
          <input
            className="field"
            style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, height: 'auto', fontSize: 13 }}
            placeholder="Filter logs… (error, warn, started…)"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          {filter && <button className="btn btn-secondary btn-sm" onClick={() => setFilter('')}>Clear</button>}
          {lines.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {filtered.length}/{lines.length} lines
            </span>
          )}
        </div>

        {/* Log terminal */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Terminal title bar */}
          <div style={{
            padding: '10px 14px',
            background: '#111118',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: '12px 12px 0 0',
          }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FF3B30' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FF9F0A' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#34C759' }} />
            </div>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8E8E93', flex: 1, textAlign: 'center' }}>
              {proc ? `${proc.name} — ${proc.framework ?? proc.language ?? 'app'} · port ${proc.port}` : 'Select an app to stream logs'}
            </span>
            {streaming && selected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#34C759', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 11, color: '#34C759', fontWeight: 600 }}>streaming</span>
              </div>
            )}
            {proc && (
              <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[proc.status] ?? '#8E8E93', flexShrink: 0 }}>
                {proc.status}
              </span>
            )}
          </div>

          {/* Log output */}
          <div
            ref={logRef}
            style={{
              background: '#0D0D14',
              padding: '12px 16px',
              minHeight: 300,
              maxHeight: 520,
              overflowY: 'auto',
              borderRadius: '0 0 12px 12px',
            }}
          >
            {!selected && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#636366' }}>
                <FileText size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <div style={{ fontSize: 13 }}>Select a running app above to stream live logs</div>
                {procs.length === 0 && (
                  <div style={{ fontSize: 12, marginTop: 8, color: '#4a4a55' }}>
                    No apps running yet —{' '}
                    <a href="/deploy" style={{ color: '#007AFF' }}>deploy one</a>
                  </div>
                )}
              </div>
            )}

            {selected && filtered.length === 0 && (
              <div style={{ color: '#636366', fontSize: 12, fontFamily: 'monospace', padding: '16px 0' }}>
                {filter ? `No lines matching "${filter}"` : 'Waiting for output…'}
              </div>
            )}

            {filtered.map((l, i) => <LogLine key={i} line={l} />)}
          </div>
        </div>

        {/* No apps notice */}
        {procs.length === 0 && connected && (
          <div className="card card-inner animate-rise" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Activity size={18} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No live apps yet</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Deploy a Node.js, Python, Discord bot, or any server app to see logs here in real time.
              </div>
            </div>
            <a href="/deploy" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>Deploy Now</a>
          </div>
        )}

      </div>
    </Shell>
  );
}
