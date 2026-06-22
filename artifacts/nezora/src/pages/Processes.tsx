import { useState, useEffect, useRef, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import {
  Activity, RotateCw, Square, Terminal, ExternalLink, Zap,
  AlertTriangle, CheckCircle2, Loader2, Wifi, WifiOff, RefreshCw
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface ManagedProcess {
  id: string; name: string; status: string; port: number;
  restarts: number; startedAt?: string; url?: string;
  framework?: string; language?: string;
}
interface DeployJob {
  id: string; name: string; status: string;
  createdAt: number; startedAt?: number; finishedAt?: number;
  logs: string[]; result?: any; error?: string;
}
interface WorkerStatus {
  id: string; name: string; type: string; status: string;
  runs: number; errors: number; lastError?: string; lastRun?: string; nextRun?: string;
}
interface QueueInfo { running: number; queued: number; max: number }

const STATUS_COLOR: Record<string, string> = {
  running: '#34C759', starting: '#FF9F0A', restarting: '#FF9F0A',
  crashed: '#FF3B30', stopped: '#8E8E93',
};
const JOB_COLOR: Record<string, string> = {
  done: '#34C759', running: '#007AFF', queued: '#FF9F0A', failed: '#FF3B30',
};

function timeAgo(ms?: number | string) {
  if (!ms) return '—';
  const t = typeof ms === 'string' ? new Date(ms).getTime() : ms;
  const d = Date.now() - t;
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  return `${Math.floor(d / 3600000)}h ago`;
}
function duration(start?: number, end?: number) {
  if (!start) return '—';
  const d = (end || Date.now()) - start;
  if (d < 1000) return `${d}ms`;
  if (d < 60000) return `${(d / 1000).toFixed(1)}s`;
  return `${Math.floor(d / 60000)}m ${Math.floor((d % 60000) / 1000)}s`;
}

export default function Processes() {
  const base = BASE();
  const [procs, setProcs] = useState<ManagedProcess[]>([]);
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logsRef = useRef<HTMLPreElement>(null);
  const logEsRef = useRef<EventSource | null>(null);

  // ── Main SSE connection ────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource(`${base}/api/real/events/stream`, { withCredentials: true });

      es.addEventListener('init', (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setProcs(d.processes ?? []);
        setJobs(d.jobs ?? []);
        setWorkers(d.workers ?? []);
        setQueueInfo(d.queue ?? null);
        setLoading(false);
        setConnected(true);
      });

      es.addEventListener('process', (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setProcs(d.processes ?? []);
        if (d.queue) setQueueInfo(d.queue);
      });

      es.addEventListener('log', (e: MessageEvent) => {
        const { id, line } = JSON.parse(e.data);
        // Only append to panel if this process's logs are expanded
        setExpandedId(cur => {
          if (cur === id) setLogLines(prev => [...prev.slice(-499), line]);
          return cur;
        });
      });

      es.addEventListener('state', (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        if (d.jobs) setJobs(d.jobs);
        if (d.workers) setWorkers(d.workers);
        if (d.queue) setQueueInfo(d.queue);
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [base]);

  // ── Per-process log SSE ────────────────────────────────────────────────────
  const openLogs = useCallback((id: string) => {
    logEsRef.current?.close();
    setLogLines([]);
    setExpandedId(id);

    const es = new EventSource(
      `${base}/api/real/processes/${id}/logs/stream`,
      { withCredentials: true }
    );
    es.onmessage = (e: MessageEvent) => {
      const { line } = JSON.parse(e.data);
      setLogLines(prev => [...prev.slice(-499), line]);
      setTimeout(() => logsRef.current?.scrollTo(0, logsRef.current.scrollHeight), 30);
    };
    logEsRef.current = es;
  }, [base]);

  const closeLogs = useCallback(() => {
    logEsRef.current?.close();
    logEsRef.current = null;
    setExpandedId(null);
    setLogLines([]);
  }, []);

  useEffect(() => () => { logEsRef.current?.close(); }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const action = async (url: string, method = 'POST') => {
    await fetch(`${base}${url}`, { method, credentials: 'include' });
  };

  return (
    <Shell title="Live Apps">
      <div className="animate-rise" style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="section-title">Live Apps & Workers</div>
            <div className="section-subtitle">Real-time — no refresh needed</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Connection indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: connected ? '#34C75915' : '#FF3B3015', border: `1px solid ${connected ? '#34C75940' : '#FF3B3040'}` }}>
              {connected
                ? <><Wifi size={12} color="#34C759" /><span style={{ fontSize: 11, color: '#34C759', fontWeight: 600 }}>Live</span></>
                : <><WifiOff size={12} color="#FF3B30" /><span style={{ fontSize: 11, color: '#FF3B30', fontWeight: 600 }}>Reconnecting…</span></>}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.href = '/deploy'}>
              <Zap size={13} /> Deploy App
            </button>
          </div>
        </div>

        {/* Queue stats bar */}
        {queueInfo && (
          <div className="card card-inner" style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '10px 16px' }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Workers: <strong style={{ color: 'var(--text-primary)' }}>{queueInfo.running}/{queueInfo.max}</strong> active
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Queue: <strong style={{ color: queueInfo.queued > 0 ? '#FF9F0A' : 'var(--text-primary)' }}>{queueInfo.queued}</strong> waiting
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Live apps: <strong style={{ color: 'var(--text-primary)' }}>{procs.filter(p => p.status === 'running').length}</strong>
            </span>
          </div>
        )}

        {/* Live processes */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Live Processes</div>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}><Loader2 size={20} className="spin" style={{ margin: '0 auto' }} /></div>}
          {!loading && procs.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <Activity size={24} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>No live apps running. Deploy a Node.js or Python app to see it here.</div>
            </div>
          )}
          {procs.map(proc => (
            <div key={proc.id} style={{ marginBottom: 8 }}>
              <div className="card card-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: STATUS_COLOR[proc.status] ?? '#8E8E93', boxShadow: proc.status === 'running' ? `0 0 6px ${STATUS_COLOR[proc.status]}80` : 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{proc.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface)', borderRadius: 4, padding: '1px 5px' }}>{proc.framework ?? proc.language ?? 'app'}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[proc.status] ?? '#8E8E93' }}>{proc.status}</span>
                    {proc.restarts > 0 && <span style={{ fontSize: 11, color: '#FF9F0A' }}>↺ {proc.restarts} restart{proc.restarts > 1 ? 's' : ''}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    :{proc.port} · started {timeAgo(proc.startedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {proc.url && (
                    <a href={proc.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><ExternalLink size={13} /></a>
                  )}
                  <button className="btn btn-secondary btn-sm" title={expandedId === proc.id ? 'Close logs' : 'Stream logs'}
                    style={{ background: expandedId === proc.id ? '#007AFF10' : undefined, color: expandedId === proc.id ? '#007AFF' : undefined }}
                    onClick={() => expandedId === proc.id ? closeLogs() : openLogs(proc.id)}>
                    <Terminal size={13} />
                  </button>
                  <button className="btn btn-secondary btn-sm" title="Restart" onClick={() => action(`/api/real/processes/${proc.id}/restart`)}><RotateCw size={13} /></button>
                  <button className="btn btn-secondary btn-sm" title="Stop" style={{ color: '#FF3B30' }} onClick={() => action(`/api/real/processes/${proc.id}`, 'DELETE')}><Square size={13} /></button>
                </div>
              </div>

              {/* Inline live log panel */}
              {expandedId === proc.id && (
                <div style={{ background: '#0A0A0F', borderRadius: '0 0 10px 10px', padding: '10px 12px', marginTop: -4, border: '1px solid #007AFF30', borderTop: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: '#34C759', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: 11, color: '#34C759', fontWeight: 600 }}>Streaming live</span>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={closeLogs}>Close</button>
                  </div>
                  <pre ref={logsRef} style={{ color: '#e5e5e5', fontSize: 11, maxHeight: 260, overflow: 'auto', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {logLines.length ? logLines.join('\n') : 'Waiting for output…'}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Deploy jobs */}
        {jobs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Deploy Queue</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobs.slice(0, 10).map(job => (
                <div key={job.id} className="card card-inner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: JOB_COLOR[job.status] ?? '#8E8E93', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: JOB_COLOR[job.status] }}>{job.status}</span>
                        {job.result?.url && (
                          <a href={job.result.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}>
                            <ExternalLink size={11} /> Open
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {job.status === 'running' && job.startedAt ? `Running for ${duration(job.startedAt)}` : ''}
                        {job.status === 'done' ? `Done in ${duration(job.startedAt, job.finishedAt)}` : ''}
                        {job.status === 'failed' ? `Failed: ${job.error}` : ''}
                        {job.status === 'queued' ? `Queued ${timeAgo(job.createdAt)}` : ''}
                      </div>
                    </div>
                  </div>
                  {(job.status === 'running' || job.status === 'failed') && job.logs.length > 0 && (
                    <pre style={{ marginTop: 8, background: '#0A0A0F', borderRadius: 8, padding: 10, color: '#e5e5e5', fontSize: 11, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {job.logs.slice(-30).join('\n')}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Background workers */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Background Workers</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {workers.map(w => (
              <div key={w.id} className="card card-inner" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {w.status === 'running'
                    ? <Loader2 size={12} className="spin" style={{ color: '#007AFF' }} />
                    : w.status === 'error'
                    ? <AlertTriangle size={12} color="#FF3B30" />
                    : <CheckCircle2 size={12} color="#34C759" />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{w.name}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {w.runs} runs · {w.errors} errors{w.lastRun ? ` · ${timeAgo(w.lastRun)}` : ''}
                </div>
                {w.lastError && <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 4, wordBreak: 'break-word' }}>{w.lastError}</div>}
              </div>
            ))}
            {workers.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Workers start after the first API server boot.
              </div>
            )}
          </div>
        </div>

      </div>
    </Shell>
  );
}
