import { useState, useRef, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import { Rocket, Upload, GitBranch, Package, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, Zap } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

type Tab = 'zip' | 'git' | 'docker';

function LogLine({ line }: { line: string }) {
  const cls = line.includes('[ERR]') || line.includes('error') || line.toLowerCase().includes('failed')
    ? 'log-err' : line.includes('[DEPLOY]') || line.includes('✓') || line.toLowerCase().includes('success')
    ? 'log-ok' : line.includes('[DETECT]') || line.includes('[BUILD]') || line.includes('[INSTALL]') ? 'log-info' : '';
  return <div className={cls}>{line}</div>;
}

export default function Deploy() {
  const [tab, setTab] = useState<Tab>('zip');
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [dockerImg, setDockerImg] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = BASE();

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.zip')) { setFile(f); if (!name) setName(f.name.replace(/\.zip$/i, '')); }
  }, [name]);

  const deployZip = async () => {
    if (!file) return;
    setDeploying(true); setResult(null); setLogs(['[DEPLOY] Uploading ZIP…']);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name || file.name.replace(/\.zip$/i, ''));
    try {
      const r = await fetch(`${base}/api/deploy/zip`, { method: 'POST', body: fd, credentials: 'include' });
      const data = await r.json();
      setLogs(data.logs ?? []);
      setResult(data);
    } catch (e) {
      setLogs(['[ERR] Network error — is the API server running?']);
      setResult({ ok: false, error: 'Network error' });
    }
    setDeploying(false);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 100);
  };

  const deployGit = async () => {
    if (!gitUrl) return;
    setDeploying(true); setResult(null);
    setLogs([`[DEPLOY] Cloning ${gitUrl}…`]);
    try {
      const r = await fetch(`${base}/api/deploy/git`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gitUrl, branch: gitBranch || 'main', name: name || undefined }),
      });
      const data = await r.json();
      setLogs(data.logs ?? []);
      setResult(data);
    } catch {
      setLogs(['[ERR] Network error']);
      setResult({ ok: false, error: 'Network error' });
    }
    setDeploying(false);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 100);
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'zip', label: 'ZIP Upload', icon: Upload },
    { id: 'git', label: 'Git Repo', icon: GitBranch },
    { id: 'docker', label: 'Docker', icon: Package },
  ];

  return (
    <Shell title="Deploy">
      <div className="animate-rise" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div className="section-title">Deploy Center</div>
          <div className="section-subtitle">One-click deploy — auto-detects Node, Python, PHP, React, Docker, and more</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 12, padding: 4, marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.id ? 600 : 500, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .15s' }}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* App name (shared) */}
        <div className="card card-inner" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>App Name <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional — auto-detected)</span></label>
          <input className="field" placeholder="my-awesome-app" value={name} onChange={e => setName(e.target.value)} />
        </div>

        {/* ZIP Tab */}
        {tab === 'zip' && (
          <div className="card card-inner" style={{ marginBottom: 16 }}>
            <div
              className={`drop-zone ${dragging ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={28} style={{ margin: '0 auto 12px', opacity: .4 }} />
              {file ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Drop your ZIP here</div>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>or click to browse · Max 200MB</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.zip$/i, '')); } }} />
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={12} color="#FF9500" />
                Supports: Node.js, React, Next.js, Python, Flask, FastAPI, PHP, static HTML, Docker, Go, Ruby, and more
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={deployZip} disabled={!file || deploying}>
                {deploying ? <><Loader2 size={15} className="spin" /> Deploying…</> : <><Rocket size={15} /> Deploy ZIP</>}
              </button>
            </div>
          </div>
        )}

        {/* Git Tab */}
        {tab === 'git' && (
          <div className="card card-inner" style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Repository URL</label>
            <input className="field" style={{ marginBottom: 10 }} placeholder="https://github.com/user/repo.git" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Branch</label>
            <input className="field" style={{ marginBottom: 14 }} placeholder="main" value={gitBranch} onChange={e => setGitBranch(e.target.value)} />
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} color="#FF9500" /> Public repos work instantly. For private repos, include a token in the URL.
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={deployGit} disabled={!gitUrl || deploying}>
              {deploying ? <><Loader2 size={15} className="spin" /> Cloning &amp; Deploying…</> : <><GitBranch size={15} /> Deploy from Git</>}
            </button>
          </div>
        )}

        {/* Docker Tab */}
        {tab === 'docker' && (
          <div className="card card-inner" style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Docker Image</label>
            <input className="field" style={{ marginBottom: 14 }} placeholder="nginx:latest or your-registry/image:tag" value={dockerImg} onChange={e => setDockerImg(e.target.value)} />
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8 }}>
              Docker runtime requires Docker installed on the host. On Render free tier, Docker images can be used via the Dockerfile in your repo. Use the <strong>ZIP or Git</strong> tab with a Dockerfile included in your project.
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled>
              <Package size={15} /> Docker Deploy (requires host Docker)
            </button>
          </div>
        )}

        {/* Build log */}
        {(logs.length > 0 || deploying) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
              <RefreshCw size={13} className={deploying ? 'spin' : ''} color={deploying ? '#007AFF' : '#34C759'} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Build Log</span>
            </div>
            <div className="log-box" ref={logRef} style={{ maxHeight: 320, borderRadius: '0 0 14px 14px', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
              {logs.map((l, i) => <LogLine key={i} line={l} />)}
              {deploying && <div className="log-info">⠦ Working…</div>}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="card card-inner animate-rise" style={{ borderLeft: `3px solid ${result.ok ? '#34C759' : '#FF3B30'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: result.ok ? 12 : 0 }}>
              {result.ok ? <CheckCircle2 size={20} color="#34C759" /> : <XCircle size={20} color="#FF3B30" />}
              <span style={{ fontSize: 15, fontWeight: 700, color: result.ok ? '#34C759' : '#FF3B30' }}>
                {result.ok ? 'Deployed successfully!' : 'Deploy failed'}
              </span>
            </div>
            {result.ok && result.url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                  <ExternalLink size={13} /> Open App
                </a>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.url}</span>
              </div>
            )}
            {!result.ok && result.error && (
              <div style={{ fontSize: 13, color: '#FF3B30', marginTop: 6 }}>{result.error}</div>
            )}
            {result.stack && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                Detected: <strong>{result.stack.language}/{result.stack.framework}</strong> · {result.stack.detected?.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
