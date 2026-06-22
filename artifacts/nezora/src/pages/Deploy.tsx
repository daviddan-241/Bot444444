import { useState, useRef, useCallback, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import {
  Rocket, Upload, GitBranch, Package, CheckCircle2, XCircle,
  Loader2, ExternalLink, RefreshCw, Zap, Terminal, Bot, Globe,
  Server, ChevronDown, ChevronRight, Plus, Trash2
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

type DeployMode = 'static' | 'app';
type InputMode = 'zip' | 'git';

const FRAMEWORKS = [
  { icon: '⚡', label: 'React / Vite', type: 'static' },
  { icon: '▲', label: 'Next.js', type: 'both' },
  { icon: '🟩', label: 'Node.js / Express', type: 'app' },
  { icon: '🐍', label: 'Python / Flask / FastAPI', type: 'app' },
  { icon: '🤖', label: 'Discord Bot (discord.js)', type: 'app' },
  { icon: '📱', label: 'Telegram Bot (Telegraf)', type: 'app' },
  { icon: '🐦', label: 'Twitter / X Bot', type: 'app' },
  { icon: '🌐', label: 'Static HTML', type: 'static' },
  { icon: '💎', label: 'Ruby / Sinatra', type: 'app' },
  { icon: '🐹', label: 'Go', type: 'app' },
  { icon: '🐘', label: 'PHP', type: 'app' },
  { icon: '🦕', label: 'Bun / Deno', type: 'app' },
];

interface EnvVar { key: string; value: string }

function LogLine({ line }: { line: string }) {
  const isErr = /\[ERR\]|error|failed|Error/i.test(line) && !/✅/.test(line);
  const isOk = /✅|ok|success|done|live/i.test(line) && !/ERR/.test(line);
  const isInfo = /📦|🔨|📡|📂|🔍|🚀/.test(line);
  const color = isErr ? '#FF3B30' : isOk ? '#34C759' : isInfo ? '#007AFF' : '#e5e5e5';
  return <div style={{ color, fontFamily: 'monospace', fontSize: 12, padding: '1px 0', wordBreak: 'break-all' }}>{line}</div>;
}

function EnvEditor({ vars, onChange }: { vars: EnvVar[]; onChange: (v: EnvVar[]) => void }) {
  const add = () => onChange([...vars, { key: '', value: '' }]);
  const remove = (i: number) => onChange(vars.filter((_, idx) => idx !== i));
  const update = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...vars];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Environment Variables</span>
        <button className="btn btn-secondary btn-sm" onClick={add}><Plus size={11} /> Add</button>
      </div>
      {vars.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="field" placeholder="KEY" value={v.key} onChange={e => update(i, 'key', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          <input className="field" placeholder="value" value={v.value} onChange={e => update(i, 'value', e.target.value)} style={{ flex: 2, fontFamily: 'monospace', fontSize: 12 }} type="password" />
          <button className="btn btn-secondary btn-sm" onClick={() => remove(i)} style={{ flexShrink: 0 }}><Trash2 size={11} /></button>
        </div>
      ))}
      {vars.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>No env vars set. Click Add to set PORT, API_KEY, BOT_TOKEN, etc.</div>
      )}
    </div>
  );
}

export default function Deploy() {
  const base = BASE();
  const [mode, setMode] = useState<DeployMode>('app');
  const [input, setInput] = useState<InputMode>('zip');
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [showEnv, setShowEnv] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (line: string) => setLogs(prev => [...prev.slice(-500), line]);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  useEffect(() => () => stopPoll(), []);

  const pollJob = useCallback((id: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${base}/api/real/deploy-jobs/${id}`, { credentials: 'include' });
        const data = await r.json();
        if (!data.ok) return;
        const job = data.job;
        setLogs(job.logs ?? []);
        setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
        if (job.status === 'done') {
          stopPoll();
          setDeploying(false);
          setResult({ ok: true, ...job.result, jobId: id });
        } else if (job.status === 'failed') {
          stopPoll();
          setDeploying(false);
          setResult({ ok: false, error: job.error ?? 'Deploy failed', jobId: id });
        }
      } catch {}
    }, 1500);
  }, [base]);

  const envObj = () => Object.fromEntries(envVars.filter(v => v.key).map(v => [v.key, v.value]));

  const deployApp = async () => {
    setDeploying(true); setResult(null); setLogs([]);
    try {
      let r: Response;
      if (input === 'zip') {
        if (!file) { addLog('[ERR] No file selected'); setDeploying(false); return; }
        addLog(`📂 Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', name || file.name.replace(/\.zip$/i, ''));
        fd.append('env', JSON.stringify(envObj()));
        r = await fetch(`${base}/api/real/app-deploy/zip`, { method: 'POST', body: fd, credentials: 'include' });
      } else {
        if (!gitUrl) { addLog('[ERR] No Git URL'); setDeploying(false); return; }
        addLog(`📡 Queuing deploy of ${gitUrl}…`);
        r = await fetch(`${base}/api/real/app-deploy/git`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: gitUrl, branch: gitBranch || 'main', name: name || undefined, env: envObj() }),
        });
      }
      const data = await r.json();
      if (!data.ok || !data.jobId) {
        setLogs([`[ERR] ${data.message ?? 'Queue failed'}`]);
        setResult({ ok: false, error: data.message ?? 'Queue failed' });
        setDeploying(false);
        return;
      }
      setJobId(data.jobId);
      addLog(`✅ Queued! Job ID: ${data.jobId} — tracking live…`);
      pollJob(data.jobId);
    } catch (e: any) {
      setLogs([`[ERR] Network error: ${e.message}`]);
      setResult({ ok: false, error: e.message });
      setDeploying(false);
    }
  };

  const deployStatic = async () => {
    setDeploying(true); setResult(null); setLogs(['📂 Starting static deploy…']);
    try {
      let r: Response;
      if (input === 'zip') {
        if (!file) { addLog('[ERR] No file'); setDeploying(false); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('projectName', name || file.name.replace(/\.zip$/i, ''));
        fd.append('target', 'instant');
        r = await fetch(`${base}/api/real/zip`, { method: 'POST', body: fd, credentials: 'include' });
      } else {
        if (!gitUrl) { addLog('[ERR] No URL'); setDeploying(false); return; }
        r = await fetch(`${base}/api/real/git-instant`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: gitUrl, branch: gitBranch || 'main', name: name || undefined }),
        });
      }
      const data = await r.json();
      setLogs(data.commands?.map((c: any) => `[${c.code === 0 ? 'OK' : 'ERR'}] ${c.command}`) ?? [data.message ?? '']);
      setResult(data);
      setDeploying(false);
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 100);
    } catch (e: any) {
      setLogs([`[ERR] Network error: ${e.message}`]);
      setResult({ ok: false, error: e.message });
      setDeploying(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.zip')) { setFile(f); if (!name) setName(f.name.replace(/\.zip$/i, '')); }
  }, [name]);

  const pingUrl = `https://${typeof window !== 'undefined' ? window.location.hostname : ''}${base}/api/ping`;

  return (
    <Shell title="Deploy Center">
      <div className="animate-rise" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="section-title">Deploy Center</div>
            <div className="section-subtitle">Host bots, backends, frontends, APIs, websites — anything</div>
          </div>
        </div>

        {/* Supported badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {FRAMEWORKS.map(f => (
            <span key={f.label} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {f.icon} {f.label}
            </span>
          ))}
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setMode('app')}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: `2px solid ${mode === 'app' ? '#FF3C00' : 'var(--border)'}`, background: mode === 'app' ? '#FF3C0010' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Server size={15} color={mode === 'app' ? '#FF3C00' : 'var(--text-tertiary)'} />
              <span style={{ fontSize: 14, fontWeight: 700, color: mode === 'app' ? '#FF3C00' : 'var(--text-primary)' }}>Live App</span>
              <span style={{ fontSize: 11, background: '#FF3C00', color: '#fff', borderRadius: 4, padding: '0 5px' }}>RECOMMENDED</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Node.js, Python, bots, APIs — runs as a persistent server. Auto-restarts on crash.</div>
          </button>
          <button
            onClick={() => setMode('static')}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: `2px solid ${mode === 'static' ? '#007AFF' : 'var(--border)'}`, background: mode === 'static' ? '#007AFF10' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Globe size={15} color={mode === 'static' ? '#007AFF' : 'var(--text-tertiary)'} />
              <span style={{ fontSize: 14, fontWeight: 700, color: mode === 'static' ? '#007AFF' : 'var(--text-primary)' }}>Static Site</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>React, HTML, Vue, Astro — builds once, served as static files.</div>
          </button>
        </div>

        {/* Input mode tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 10, padding: 4, marginBottom: 16 }}>
          {(['zip', 'git'] as InputMode[]).map(t => (
            <button key={t} onClick={() => setInput(t)}
              style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: input === t ? 600 : 500, background: input === t ? '#fff' : 'transparent', color: input === t ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: input === t ? '0 1px 3px rgba(0,0,0,.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {t === 'zip' ? <><Upload size={13} /> ZIP Upload</> : <><GitBranch size={13} /> Git / GitHub</>}
            </button>
          ))}
        </div>

        <div className="card card-inner" style={{ marginBottom: 16 }}>
          {/* App name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              App Name <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span>
            </label>
            <input className="field" placeholder="my-discord-bot" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* ZIP drop zone */}
          {input === 'zip' && (
            <div
              className={`drop-zone ${dragging ? 'drag-over' : ''}`}
              style={{ marginBottom: 14 }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={26} style={{ margin: '0 auto 10px', opacity: .4 }} />
              {file ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Drop your ZIP here</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>or click to browse · Max 200MB · Include all files (node_modules optional)</div>
                </>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.zip$/i, '')); } }} />

          {/* Git URL inputs */}
          {input === 'git' && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Repository URL</label>
                <input className="field" placeholder="https://github.com/user/my-bot.git" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Branch</label>
                <input className="field" placeholder="main" value={gitBranch} onChange={e => setGitBranch(e.target.value)} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                💡 Public repos work immediately. For private repos add a token: <code style={{ fontFamily: 'monospace' }}>https://TOKEN@github.com/user/repo</code>
              </div>
            </>
          )}

          {/* Env vars toggle */}
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: showEnv ? 0 : 14 }} onClick={() => setShowEnv(v => !v)}>
            {showEnv ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Environment Variables {envVars.length > 0 ? `(${envVars.length})` : ''}
          </button>
          {showEnv && <EnvEditor vars={envVars} onChange={setEnvVars} />}

          {/* Deploy button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 14, background: mode === 'app' ? '#FF3C00' : undefined }}
            onClick={mode === 'app' ? deployApp : deployStatic}
            disabled={deploying || (input === 'zip' ? !file : !gitUrl)}
          >
            {deploying
              ? <><Loader2 size={15} className="spin" /> {mode === 'app' ? 'Deploying live app…' : 'Building static site…'}</>
              : mode === 'app'
                ? <><Rocket size={15} /> Deploy Live App</>
                : <><Globe size={15} /> Deploy Static Site</>}
          </button>
        </div>

        {/* Build log */}
        {(logs.length > 0 || deploying) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
              <Terminal size={13} color={deploying ? '#007AFF' : '#34C759'} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Deploy Log</span>
              {deploying && <Loader2 size={13} className="spin" color="#007AFF" style={{ marginLeft: 'auto' }} />}
              {jobId && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', fontFamily: 'monospace' }}>job: {jobId.slice(-12)}</span>}
            </div>
            <div ref={logRef} style={{ background: '#0A0A0F', borderRadius: '0 0 12px 12px', padding: '10px 14px', maxHeight: 360, overflowY: 'auto' }}>
              {logs.map((l, i) => <LogLine key={i} line={l} />)}
              {deploying && logs.length === 0 && <LogLine line="⠦ Waiting for worker slot…" />}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="card card-inner animate-rise" style={{ borderLeft: `3px solid ${result.ok ? '#34C759' : '#FF3B30'}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: result.ok ? 12 : 4 }}>
              {result.ok ? <CheckCircle2 size={20} color="#34C759" /> : <XCircle size={20} color="#FF3B30" />}
              <span style={{ fontSize: 15, fontWeight: 700, color: result.ok ? '#34C759' : '#FF3B30' }}>
                {result.ok ? 'Deployed successfully!' : 'Deploy failed'}
              </span>
            </div>
            {result.ok && result.url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ background: '#34C759' }}>
                  <ExternalLink size={13} /> Open App
                </a>
                <code style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>{result.url}</code>
              </div>
            )}
            {result.ok && result.type === 'live-app' && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>🤖 Live process running — auto-restarts on crash</div>
                <a href="/processes" style={{ fontSize: 12, color: '#007AFF' }}>View in Live Apps →</a>
              </div>
            )}
            {!result.ok && <div style={{ fontSize: 13, color: '#FF3B30', marginTop: 4 }}>{result.error}</div>}
          </div>
        )}

        {/* Keep-alive section */}
        <div className="card card-inner" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Zap size={15} color="#FF9500" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Keep Your Server Alive 24/7</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            The built-in keep-alive worker pings the server every 4 minutes automatically. For guaranteed 24/7 uptime, add this URL to a free uptime monitor like <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" style={{ color: '#007AFF' }}>UptimeRobot</a> or <a href="https://cron-job.org" target="_blank" rel="noreferrer" style={{ color: '#007AFF' }}>cron-job.org</a>:
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{pingUrl}</code>
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(pingUrl)}>Copy</button>
          </div>
        </div>

      </div>
    </Shell>
  );
}
