import { useState, useRef, useCallback, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import {
  Rocket, Upload, GitBranch, CheckCircle2, XCircle,
  Loader2, ExternalLink, Zap, Terminal, Plus, Trash2,
  ChevronDown, ChevronRight, Link, Settings2, HeartPulse,
  AlertTriangle
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');
const STORE_KEY = 'nezora_deploy_v3';

type InputMode = 'upload' | 'git';

const SUPPORTED = [
  { label: 'Node.js / Express',  type: 'live',   hint: 'package.json — Express/Fastify/Koa/Hapi + npm/yarn/pnpm/bun' },
  { label: 'Next.js',            type: 'live',   hint: 'SSR — npm run build + npm run start' },
  { label: 'React / Vite',       type: 'static', hint: 'Vite build → dist/ served as static' },
  { label: 'Vue / Nuxt',         type: 'live',   hint: 'Vue SPA (static) or Nuxt SSR (live)' },
  { label: 'Svelte / SvelteKit', type: 'static', hint: 'Built with Vite or adapter-node' },
  { label: 'NestJS / AdonisJS',  type: 'live',   hint: 'TypeScript backends — build + start:prod' },
  { label: 'Gatsby / Astro',     type: 'static', hint: 'Static site generators' },
  { label: 'Discord Bot (JS)',   type: 'worker', hint: 'discord.js / Eris / Oceanic — background worker' },
  { label: 'Telegram Bot (JS)',  type: 'worker', hint: 'Telegraf / Grammy — background worker' },
  { label: 'WhatsApp Bot',       type: 'worker', hint: 'Baileys / whatsapp-web.js — background worker' },
  { label: 'Python / Flask',     type: 'live',   hint: 'pip / poetry / pipenv / uv — Flask, Django, FastAPI' },
  { label: 'FastAPI / Uvicorn',  type: 'live',   hint: 'ASGI — uvicorn module:app --host 0.0.0.0 --port $PORT' },
  { label: 'Django',             type: 'live',   hint: 'python manage.py runserver 0.0.0.0:$PORT' },
  { label: 'Streamlit / Gradio', type: 'live',   hint: 'Data apps — started on $PORT with correct flags' },
  { label: 'Discord.py Bot',     type: 'worker', hint: 'discord.py / nextcord / hikari — background worker' },
  { label: 'Go',                 type: 'live',   hint: 'go.mod → go mod download → go build → binary' },
  { label: 'Rust',               type: 'live',   hint: 'Cargo.toml → cargo build --release → binary' },
  { label: 'Ruby / Rails',       type: 'live',   hint: 'Gemfile → bundle install → rails / sinatra server' },
  { label: 'PHP / Laravel',      type: 'live',   hint: 'composer install → php -S or artisan serve' },
  { label: 'Java / Spring',      type: 'live',   hint: 'pom.xml → mvn package → java -jar *.jar' },
  { label: 'Java / Gradle',      type: 'live',   hint: 'build.gradle → gradle build → java -jar *.jar' },
  { label: 'Deno',               type: 'live',   hint: 'deno.json → deno run --allow-all main.ts' },
  { label: 'Bun',                type: 'live',   hint: 'bun install → bun run' },
  { label: 'Static HTML',        type: 'static', hint: 'index.html detected → served with npx serve' },
  { label: 'Dockerfile',         type: 'live',   hint: 'Your own Dockerfile — full control' },
  { label: 'Procfile',           type: 'live',   hint: 'web: line used as start command — like Render/Heroku' },
] as const;

const TC = {
  live:   { bg: 'rgba(52,199,89,.10)',   border: 'rgba(52,199,89,.30)',   text: '#34C759', dot: '#34C759',  label: 'Live Process' },
  static: { bg: 'rgba(0,122,255,.10)',   border: 'rgba(0,122,255,.30)',   text: '#007AFF', dot: '#007AFF',  label: 'Static Site'  },
  worker: { bg: 'rgba(88,86,214,.10)',   border: 'rgba(88,86,214,.30)',   text: '#5856D6', dot: '#5856D6',  label: 'Worker'       },
};

// Accepted archive extensions
const ARCHIVE_EXTS = ['.zip', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar', '.gz', '.bz2', '.xz'];
const ARCHIVE_ACCEPT = ARCHIVE_EXTS.join(',');

function isArchive(name: string): boolean {
  const low = name.toLowerCase();
  return ARCHIVE_EXTS.some(e => low.endsWith(e));
}

interface EnvVar { key: string; value: string }
interface Hints {
  language: string; startCmd: string; buildCmd: string; installCmd: string; port: string;
}

function LogLine({ line }: { line: string }) {
  const lo = line.toLowerCase();
  const isErr  = /error|failed|exception|fatal/i.test(line) && !/installed|success|complete|passed/.test(lo);
  const isOk   = /success|complete|installed|live at|passed|done/i.test(line);
  const isInfo = /detecting|cloning|extracting|copying|installing|building|starting|queuing|downloading|rewriting/i.test(line);
  const isWarn = /warning|warn|skipping|fallback|not found|trying|uncertain/i.test(line);
  const isHealth = /health check/i.test(line);
  const color  = isErr ? '#FF3B30' : isWarn ? '#FF9500' : isOk ? '#34C759' : isHealth ? '#5856D6' : isInfo ? '#007AFF' : '#d4d4d4';
  return (
    <div style={{ color, fontFamily: 'monospace', fontSize: 12, padding: '2px 0', wordBreak: 'break-all', lineHeight: 1.6 }}>
      {line}
    </div>
  );
}

function Badge({ item, hovered, onEnter, onLeave }: { item: typeof SUPPORTED[number]; hovered: boolean; onEnter: () => void; onLeave: () => void }) {
  const c = TC[item.type];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onMouseEnter={onEnter} onMouseLeave={onLeave}
        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 20, cursor: 'default', background: c.bg, border: `1px solid ${c.border}`, color: c.text, display: 'inline-flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
        <span style={{ width: 5, height: 5, borderRadius: 3, background: c.dot, flexShrink: 0 }} />
        {item.label}
      </span>
      {hovered && (
        <div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', background: '#0e0e1a', color: '#fff', fontSize: 11, padding: '8px 12px', borderRadius: 9, zIndex: 200, boxShadow: '0 4px 24px rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.1)', pointerEvents: 'none', minWidth: 200, maxWidth: 280, whiteSpace: 'normal' }}>
          <div style={{ color: c.text, fontWeight: 700, marginBottom: 4 }}>{c.label}</div>
          <div style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>{item.hint}</div>
        </div>
      )}
    </div>
  );
}

function EnvEditor({ vars, onChange }: { vars: EnvVar[]; onChange: (v: EnvVar[]) => void }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Environment Variables</span>
        <button className="btn btn-secondary btn-sm" onClick={() => onChange([...vars, { key: '', value: '' }])}><Plus size={11} /> Add</button>
      </div>
      {vars.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>PORT, BOT_TOKEN, DATABASE_URL, API_KEY, etc.</div>}
      {vars.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
          <input className="field" placeholder="KEY" value={v.key} onChange={e => { const n=[...vars];n[i]={...n[i],key:e.target.value};onChange(n); }} style={{ flex:1, fontFamily:'monospace', fontSize:12 }} />
          <input className="field" placeholder="value" type="password" value={v.value} onChange={e => { const n=[...vars];n[i]={...n[i],value:e.target.value};onChange(n); }} style={{ flex:2, fontFamily:'monospace', fontSize:12 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => onChange(vars.filter((_,j)=>j!==i))}><Trash2 size={11}/></button>
        </div>
      ))}
    </div>
  );
}

function HintsEditor({ hints, onChange }: { hints: Hints; onChange: (h: Hints) => void }) {
  const set = (k: keyof Hints, v: string) => onChange({ ...hints, [k]: v });
  const LANGS = ['auto-detect','node','python','go','rust','ruby','php','java','deno','bun','html'];
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(255,149,0,.06)', borderRadius: 10, border: '1px solid rgba(255,149,0,.2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#FF9500', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Settings2 size={13} /> Manual Override (optional — overrides auto-detection)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Language</label>
          <select className="field" value={hints.language} onChange={e => set('language', e.target.value)} style={{ fontSize: 12 }}>
            {LANGS.map(l => <option key={l} value={l === 'auto-detect' ? '' : l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Port (if different)</label>
          <input className="field" placeholder="3000" value={hints.port} onChange={e => set('port', e.target.value)} style={{ fontSize: 12, fontFamily: 'monospace' }} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Install Command</label>
        <input className="field" placeholder="pip install -r requirements.txt  /  npm install" value={hints.installCmd} onChange={e => set('installCmd', e.target.value)} style={{ fontSize: 12, fontFamily: 'monospace' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Build Command</label>
        <input className="field" placeholder="npm run build  /  go build -o app .  /  leave blank if none" value={hints.buildCmd} onChange={e => set('buildCmd', e.target.value)} style={{ fontSize: 12, fontFamily: 'monospace' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Start Command</label>
        <input className="field" placeholder="python main.py  /  node index.js  /  ./app" value={hints.startCmd} onChange={e => set('startCmd', e.target.value)} style={{ fontSize: 12, fontFamily: 'monospace' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
        Leave fields blank for auto-detection. Fill in only what you want to override.
      </div>
    </div>
  );
}

const emptyHints: Hints = { language: '', startCmd: '', buildCmd: '', installCmd: '', port: '' };

export default function Deploy() {
  const base = BASE();

  const load = (k: string, def: string) => { try { return localStorage.getItem(`${STORE_KEY}_${k}`) ?? def; } catch { return def; } };
  const save = (k: string, v: string) => { try { localStorage.setItem(`${STORE_KEY}_${k}`, v); } catch {} };

  const [mode, setMode]           = useState<InputMode>(() => load('mode', 'upload') as InputMode);
  const [name, setName]           = useState(() => load('name', ''));
  const [slug, setSlug]           = useState(() => load('slug', ''));
  const [gitUrl, setGitUrl]       = useState(() => load('gitUrl', ''));
  const [gitBranch, setBranch]    = useState(() => load('branch', 'main'));
  const [gitToken, setToken]      = useState('');
  const [file, setFile]           = useState<File | null>(null);
  const [fileErr, setFileErr]     = useState('');
  const [dragging, setDragging]   = useState(false);
  const [envVars, setEnvVars]     = useState<EnvVar[]>([]);
  const [hints, setHints]         = useState<Hints>(emptyHints);
  const [showEnv, setShowEnv]     = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [jobId, setJobId]         = useState<string | null>(null);
  const [logs, setLogs]           = useState<string[]>([]);
  const [result, setResult]       = useState<any>(null);
  const [hovered, setHovered]     = useState<number | null>(null);

  const logRef  = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { save('mode',   mode);      }, [mode]);
  useEffect(() => { save('name',   name);      }, [name]);
  useEffect(() => { save('slug',   slug);      }, [slug]);
  useEffect(() => { save('gitUrl', gitUrl);    }, [gitUrl]);
  useEffect(() => { save('branch', gitBranch); }, [gitBranch]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const scrollLog = () => setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);

  const pollJob = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${base}/api/real/deploy-jobs/${id}`, { credentials: 'include' });
        const data = await r.json();
        if (!data.ok) return;
        const job = data.job;
        setLogs(job.logs ?? []);
        scrollLog();
        if (job.status === 'done') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setDeploying(false);
          setResult({ ok: true, ...job.result });
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setDeploying(false);
          setResult({ ok: false, error: job.error ?? 'Deploy failed' });
        }
      } catch { /* ignore network errors during polling */ }
    }, 1500);
  }, [base]);

  const envObj = () => Object.fromEntries(envVars.filter(v => v.key).map(v => [v.key, v.value]));
  const hintsObj = () => {
    const h: Record<string, string> = {};
    if (hints.language)   h.hint_language    = hints.language;
    if (hints.startCmd)   h.hint_start_cmd   = hints.startCmd;
    if (hints.buildCmd)   h.hint_build_cmd   = hints.buildCmd;
    if (hints.installCmd) h.hint_install_cmd = hints.installCmd;
    if (hints.port)       h.hint_port        = hints.port;
    return h;
  };

  const pickFile = (f: File) => {
    setFileErr('');
    if (!isArchive(f.name)) {
      setFileErr(`"${f.name}" is not a recognized archive. Accepted: ${ARCHIVE_EXTS.join(', ')}`);
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.(zip|tar\.gz|tgz|tar\.bz2|tar\.xz|tar|gz|bz2|xz)$/i, ''));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, [name]);

  const deploy = async () => {
    setDeploying(true); setResult(null); setLogs([]);
    try {
      let r: Response;
      if (mode === 'upload') {
        if (!file) { setLogs(['No file selected']); setDeploying(false); return; }
        setLogs([`Uploading ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)...`]);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', name || file.name.replace(/\.(zip|tar\.gz|tgz|tar\.bz2|tar\.xz|tar)$/i, ''));
        fd.append('slug', slug);
        fd.append('env', JSON.stringify(envObj()));
        for (const [k, v] of Object.entries(hintsObj())) fd.append(k, v);
        r = await fetch(`${base}/api/real/app-deploy/upload`, { method: 'POST', body: fd, credentials: 'include' });
      } else {
        if (!gitUrl) { setLogs(['No Git URL provided']); setDeploying(false); return; }
        setLogs([`Queuing deploy of ${gitUrl}...`]);
        r = await fetch(`${base}/api/real/app-deploy/git`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: gitUrl, branch: gitBranch || 'main', name: name || undefined, slug: slug || undefined, token: gitToken || undefined, env: envObj(), ...hintsObj() }),
        });
      }
      const data = await r.json();
      if (!data.ok || !data.jobId) {
        setLogs([`Failed: ${data.message ?? 'Queue error'}`]);
        setResult({ ok: false, error: data.message ?? 'Failed to queue' });
        setDeploying(false); return;
      }
      setJobId(data.jobId);
      if (data.archiveType && data.archiveType !== 'unknown') setLogs(p => [...p, `Archive: ${data.archiveType}`]);
      pollJob(data.jobId);
    } catch (e: any) {
      setLogs([`Network error: ${e.message}`]);
      setResult({ ok: false, error: e.message });
      setDeploying(false);
    }
  };

  // Show clarification panel if deploy failed with "unknown" or warning
  const detectionFailed = result?.ok === false && /unknown|uncertain|no recognizable/i.test(result?.error ?? '');
  const warnInLog = logs.some(l => /uncertain|confidence.*low|stack detection uncertain/i.test(l));

  const pingUrl = `https://${typeof window !== 'undefined' ? window.location.hostname : ''}${base}/api/ping`;

  return (
    <Shell title="Deploy Center">
      <div className="animate-rise" style={{ maxWidth: 740, margin: '0 auto' }}>

        <div style={{ marginBottom: 16 }}>
          <div className="section-title">Deploy Center</div>
          <div className="section-subtitle">
            Drop any archive (ZIP, tar.gz, tgz, tar.bz2, tar.xz) or paste a Git URL — auto-detects and installs everything
          </div>
        </div>

        {/* Framework badges */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {SUPPORTED.map((f, i) => (
              <Badge key={f.label} item={f} hovered={hovered === i} onEnter={() => setHovered(i)} onLeave={() => setHovered(null)} />
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#34C759' }}>●</span> Live process</span>
            <span><span style={{ color: '#007AFF' }}>●</span> Static site</span>
            <span><span style={{ color: '#5856D6' }}>●</span> Background worker</span>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 10, padding: 4, marginBottom: 16 }}>
          {(['upload', 'git'] as InputMode[]).map(t => (
            <button key={t} onClick={() => setMode(t)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: mode===t ? 600 : 500, background: mode===t ? '#fff' : 'transparent', color: mode===t ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: mode===t ? '0 1px 3px rgba(0,0,0,.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {t === 'upload' ? <><Upload size={13} /> Upload Archive</> : <><GitBranch size={13} /> Git / GitHub</>}
            </button>
          ))}
        </div>

        <div className="card card-inner" style={{ marginBottom: 16 }}>
          {/* App name */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              App Name <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(auto-detected if blank)</span>
            </label>
            <input className="field" placeholder="my-bot or my-api" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Slug */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Link size={12} /> Custom URL slug <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span>
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: 9, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
              <span style={{ padding: '9px 10px', fontSize: 12, color: 'var(--text-tertiary)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>/app/</span>
              <input className="field" placeholder="auto-generated" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} style={{ border: 'none', background: 'transparent', flex: 1, borderRadius: 0, paddingLeft: 8 }} />
            </div>
          </div>

          {/* Upload drop zone */}
          {mode === 'upload' && (
            <>
              <div
                className={`drop-zone ${dragging ? 'drag-over' : ''}`}
                style={{ marginBottom: fileErr ? 6 : 14 }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={26} style={{ margin: '0 auto 10px', opacity: .4 }} />
                {file ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{(file.size/1024/1024).toFixed(2)} MB — click to change</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Drop your archive here</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      .zip .tar.gz .tgz .tar.bz2 .tar.xz .tar — max 300 MB
                    </div>
                  </>
                )}
              </div>
              {fileErr && (
                <div style={{ fontSize: 12, color: '#FF3B30', marginBottom: 14, padding: '6px 10px', background: 'rgba(255,59,48,.08)', borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {fileErr}
                </div>
              )}
              <input ref={fileRef} type="file" accept={ARCHIVE_ACCEPT} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
            </>
          )}

          {/* Git inputs */}
          {mode === 'git' && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Repository URL</label>
                <input className="field" placeholder="https://github.com/user/repo" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Branch</label>
                  <input className="field" placeholder="main" value={gitBranch} onChange={e => setBranch(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Token <span style={{ fontWeight:400, color:'var(--text-tertiary)' }}>(private repos)</span>
                  </label>
                  <input className="field" type="password" placeholder="ghp_xxxx" value={gitToken} onChange={e => setToken(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, padding: '7px 10px', background: 'var(--bg)', borderRadius: 8, lineHeight: 1.6 }}>
                Public repos: no token needed. Private repos: enter a GitHub PAT with repo read access, or prepend token to URL:
                <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}> https://TOKEN@github.com/user/repo</code>
              </div>
            </>
          )}

          {/* Env vars toggle */}
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 6 }} onClick={() => setShowEnv(v => !v)}>
            {showEnv ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            Environment Variables {envVars.length > 0 ? `(${envVars.length})` : ''}
          </button>
          {showEnv && <EnvEditor vars={envVars} onChange={setEnvVars} />}

          {/* Manual hints toggle */}
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 6, marginBottom: 6 }} onClick={() => setShowHints(v => !v)}>
            {showHints ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            <Settings2 size={12}/> Manual Override {Object.values(hints).some(Boolean) ? '(active)' : '(optional)'}
          </button>
          {showHints && <HintsEditor hints={hints} onChange={setHints} />}

          {/* Deploy button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 14, background: '#FF3C00' }}
            onClick={deploy}
            disabled={deploying || (mode === 'upload' ? !file : !gitUrl)}
          >
            {deploying
              ? <><Loader2 size={15} className="spin" /> Deploying...</>
              : <><Rocket size={15} /> Deploy</>}
          </button>
        </div>

        {/* Deploy log */}
        {(logs.length > 0 || deploying) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <Terminal size={13} color={deploying ? '#007AFF' : '#34C759'} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Deploy Log</span>
              {deploying && <Loader2 size={13} className="spin" color="#007AFF" />}
              {jobId && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', fontFamily: 'monospace' }}>job: {jobId.slice(-12)}</span>}
              {logs.some(l => /health check passed/i.test(l)) && (
                <span style={{ fontSize: 11, color: '#34C759', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HeartPulse size={12} /> Health OK
                </span>
              )}
            </div>
            <div ref={logRef} style={{ background: '#08080F', borderRadius: '0 0 12px 12px', padding: '10px 14px', maxHeight: 420, overflowY: 'auto' }}>
              {logs.map((l, i) => <LogLine key={i} line={l} />)}
              {deploying && logs.length === 0 && <LogLine line="Waiting for deploy worker..." />}
            </div>
          </div>
        )}

        {/* Clarification card — shown when detection failed */}
        {(detectionFailed || warnInLog) && !deploying && (
          <div className="card card-inner animate-rise" style={{ marginBottom: 16, border: '1px solid rgba(255,149,0,.3)', background: 'rgba(255,149,0,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={16} color="#FF9500" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#FF9500' }}>Help Nezora identify your project</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
              Auto-detection was uncertain. Expand <b>Manual Override</b> above to specify your language, start command, and build command, then re-deploy.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
              <b>Examples:</b><br/>
              Python Flask → Language: <code>python</code>, Start: <code>python app.py</code><br/>
              FastAPI → Start: <code>uvicorn main:app --host 0.0.0.0 --port $PORT</code><br/>
              Node.js → Language: <code>node</code>, Start: <code>node server.js</code><br/>
              Django → Start: <code>python manage.py runserver 0.0.0.0:$PORT</code><br/>
              Go binary → Build: <code>go build -o app .</code>, Start: <code>./app</code>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => { setShowHints(true); window.scrollTo(0, 0); }}>
              <Settings2 size={12} /> Open Manual Override
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="card card-inner animate-rise" style={{ borderLeft: `3px solid ${result.ok ? '#34C759' : '#FF3B30'}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: result.ok ? 12 : 4 }}>
              {result.ok ? <CheckCircle2 size={20} color="#34C759" /> : <XCircle size={20} color="#FF3B30" />}
              <span style={{ fontSize: 15, fontWeight: 700, color: result.ok ? '#34C759' : '#FF3B30' }}>
                {result.ok ? 'Deployed successfully' : 'Deploy failed'}
              </span>
            </div>

            {result.ok && result.url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ background: '#34C759' }}>
                  <ExternalLink size={13} /> Open App
                </a>
                <code style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>{result.url}</code>
              </div>
            )}
            {result.ok && result.type === 'live-app' && (
              <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Live process — auto-restarts on crash</div>
                <a href="/processes" style={{ fontSize: 12, color: '#007AFF' }}>View in Live Apps</a>
              </div>
            )}
            {result.ok && result.type === 'worker' && (
              <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Background worker — no web URL (bot, queue, cron)</div>
                <a href="/processes" style={{ fontSize: 12, color: '#007AFF' }}>View in Live Apps</a>
              </div>
            )}
            {result.ok && result.type === 'static-site' && (
              <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Static site — instant file serving</div>
                <a href="/sites" style={{ fontSize: 12, color: '#007AFF' }}>View in Hosted Sites</a>
              </div>
            )}
            {!result.ok && (
              <div>
                <div style={{ fontSize: 13, color: '#FF3B30', marginTop: 4, lineHeight: 1.6 }}>{result.error}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.6 }}>
                  Check the deploy log above. Common fixes: add a requirements.txt, check your start command, or use Manual Override to specify commands explicitly.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keep-alive */}
        <div className="card card-inner" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Zap size={15} color="#FF9500" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Keep Your Server Alive 24/7</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Add to <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" style={{ color: '#007AFF' }}>UptimeRobot</a> or <a href="https://cron-job.org" target="_blank" rel="noreferrer" style={{ color: '#007AFF' }}>cron-job.org</a> (every 5 min):
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
