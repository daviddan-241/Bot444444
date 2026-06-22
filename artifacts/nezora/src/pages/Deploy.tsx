import { useState, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { Rocket, Github, Upload, Terminal, ChevronDown, ChevronUp, ExternalLink, Loader2, CheckCircle2, AlertCircle, Zap, Box } from 'lucide-react';

type Tab = 'git' | 'zip' | 'docker' | 'template';
type Target = 'pages' | 'render' | 'instant';

const TEMPLATES = [
  { id: 'node-api', name: 'Node.js API', desc: 'Express REST API', icon: '🟢', cmd: 'node index.js' },
  { id: 'react-vite', name: 'React + Vite', desc: 'Frontend SPA', icon: '⚛️', cmd: 'npm run build' },
  { id: 'nextjs', name: 'Next.js', desc: 'Full-stack React', icon: '▲', cmd: 'next start' },
  { id: 'fastapi', name: 'FastAPI', desc: 'Python REST API', icon: '🐍', cmd: 'uvicorn main:app' },
  { id: 'discord-bot', name: 'Discord Bot', desc: 'Bot template', icon: '🤖', cmd: 'node bot.js' },
  { id: 'static', name: 'Static Site', desc: 'HTML/CSS/JS', icon: '🌐', cmd: 'serve .' },
];

export default function Deploy() {
  const [tab, setTab] = useState<Tab>('git');
  const [target, setTarget] = useState<Target>('pages');
  const [token, setToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [owner, setOwner] = useState(() => localStorage.getItem('gh_owner') || '');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [projectName, setProjectName] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'building' | 'success' | 'failed'>('idle');
  const [result, setResult] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  function log(msg: string) { setLogs(p => [...p, msg]); }

  async function deployGit() {
    if (!token || !owner || !repo) { alert('Fill in token, owner and repo first.'); return; }
    localStorage.setItem('gh_token', token);
    localStorage.setItem('gh_owner', owner);
    setStatus('building'); setLogs([]); setResult(null); setShowLogs(true);
    log('🚀 Starting GitHub Pages deployment…');
    try {
      const r = await fetch(`${BASE}/api/real/github-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, owner, repo, branch, autoFix: true }),
        credentials: 'include',
      });
      const data = await r.json();
      (data.commands || []).forEach((c: any) => {
        log(`$ ${c.command}`);
        if (c.stdout) c.stdout.split('\n').filter(Boolean).forEach((l: string) => log(l));
        if (c.stderr) c.stderr.split('\n').filter(Boolean).forEach((l: string) => log(`⚠ ${l}`));
      });
      if (data.ok) { log(`✅ Deployed! ${data.url}`); setStatus('success'); setResult(data); }
      else { log(`❌ ${data.message}`); setStatus('failed'); }
    } catch (e: any) { log(`❌ ${e.message}`); setStatus('failed'); }
  }

  async function deployZip() {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert('Select a ZIP file first.'); return; }
    if (target !== 'instant' && (!token || !owner || !repo)) { alert('Fill in GitHub credentials for this target.'); return; }
    setStatus('building'); setLogs([]); setResult(null); setShowLogs(true);
    log(`📦 Uploading ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', token);
      fd.append('owner', owner);
      fd.append('repo', repo || file.name.replace('.zip', ''));
      fd.append('projectName', projectName || file.name.replace('.zip', ''));
      fd.append('branch', branch);
      fd.append('target', target);
      const r = await fetch(`${BASE}/api/real/zip`, { method: 'POST', body: fd, credentials: 'include' });
      const data = await r.json();
      (data.commands || []).forEach((c: any) => {
        log(`$ ${c.command}`);
        if (c.stdout) c.stdout.split('\n').filter(Boolean).forEach((l: string) => log(l));
      });
      if (data.ok) { log(`✅ Done! ${data.url || data.repoUrl}`); setStatus('success'); setResult(data); }
      else { log(`❌ ${data.message}`); setStatus('failed'); }
    } catch (e: any) { log(`❌ ${e.message}`); setStatus('failed'); }
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'git', label: 'Git Repo', icon: Github },
    { id: 'zip', label: 'ZIP Upload', icon: Upload },
    { id: 'docker', label: 'Docker', icon: Box },
    { id: 'template', label: 'Templates', icon: Zap },
  ];

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-3xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[22px] font-800 tracking-tight mb-1" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Deploy Center</h1>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>Auto-detect framework, build and deploy in one click.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-[16px] mb-5" style={{ background: '#F0F3F8' }}>
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[13px] text-[12.5px] font-600 transition-all ${tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </div>

        {/* Git tab */}
        {tab === 'git' && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>GitHub Token</label>
              <input className="field" type="password" placeholder="ghp_xxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Owner / Org</label>
                <input className="field" placeholder="username" value={owner} onChange={e => setOwner(e.target.value)} />
              </div>
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Repository</label>
                <input className="field" placeholder="my-app" value={repo} onChange={e => setRepo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Branch</label>
              <input className="field" placeholder="main" value={branch} onChange={e => setBranch(e.target.value)} />
            </div>
            <button onClick={deployGit} disabled={status === 'building'}
              className="w-full h-12 rounded-[14px] text-white font-700 text-[14px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 16px rgba(10,132,255,0.35)' }}>
              {status === 'building' ? <><Loader2 size={16} className="animate-spin" /> Building…</> : <><Rocket size={16} /> Deploy to GitHub Pages</>}
            </button>
          </div>
        )}

        {/* ZIP tab */}
        {tab === 'zip' && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="text-[12px] font-600 block mb-2" style={{ color: '#5E6E85' }}>Deployment Target</label>
              <div className="grid grid-cols-3 gap-2">
                {([['pages', 'GitHub Pages'], ['render', 'Render Blueprint'], ['instant', 'Instant URL']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setTarget(v)}
                    className={`py-2.5 rounded-[12px] text-[12px] font-600 border transition ${target === v ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    style={target === v ? { background: '#EEF6FF' } : { background: '#fff' }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>ZIP File</label>
              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed rounded-[16px] p-8 text-center cursor-pointer hover:border-blue-400 transition" style={{ borderColor: '#CBD5E1' }}>
                <Upload size={22} color="#8E9BAD" className="mx-auto mb-2" />
                <div className="text-[13px] font-600" style={{ color: '#5E6E85' }}>
                  {fileRef.current?.files?.[0] ? fileRef.current.files[0].name : 'Click to select ZIP file'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: '#8E9BAD' }}>Max 75MB</div>
              </div>
              <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={() => setProjectName(fileRef.current?.files?.[0]?.name.replace('.zip', '') || '')} />
            </div>
            {target !== 'instant' && (
              <>
                <div>
                  <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>GitHub Token</label>
                  <input className="field" type="password" placeholder="ghp_xxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Owner</label>
                    <input className="field" placeholder="username" value={owner} onChange={e => setOwner(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Repo</label>
                    <input className="field" placeholder="my-app" value={repo} onChange={e => setRepo(e.target.value)} />
                  </div>
                </div>
              </>
            )}
            <button onClick={deployZip} disabled={status === 'building'}
              className="w-full h-12 rounded-[14px] text-white font-700 text-[14px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 16px rgba(10,132,255,0.35)' }}>
              {status === 'building' ? <><Loader2 size={16} className="animate-spin" /> Deploying…</> : <><Upload size={16} /> Deploy ZIP</>}
            </button>
          </div>
        )}

        {/* Docker tab */}
        {tab === 'docker' && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Docker Image</label>
              <input className="field" placeholder="nginx:latest or ghcr.io/user/app:tag" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Container Name</label>
                <input className="field" placeholder="my-container" />
              </div>
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Port</label>
                <input className="field" placeholder="3000" type="number" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Environment Variables</label>
              <textarea className="field h-24 py-3 resize-none" placeholder="KEY=value&#10;ANOTHER=value" style={{ height: 96 }} />
            </div>
            <button className="w-full h-12 rounded-[14px] text-white font-700 text-[14px] flex items-center justify-center gap-2.5" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 16px rgba(10,132,255,0.35)' }}>
              <Box size={16} /> Pull & Run Container
            </button>
          </div>
        )}

        {/* Templates tab */}
        {tab === 'template' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map(t => (
              <div key={t.id} className="card card-hover p-4 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <div className="text-[13.5px] font-700" style={{ color: '#0A0F1E' }}>{t.name}</div>
                    <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{t.desc}</div>
                  </div>
                </div>
                <div className="text-[11px] font-500 px-2.5 py-1.5 rounded-[8px] font-mono" style={{ background: '#F0F3F8', color: '#5E6E85' }}>{t.cmd}</div>
              </div>
            ))}
          </div>
        )}

        {/* Build logs */}
        {showLogs && (
          <div className="mt-5">
            <button onClick={() => setShowLogs(v => !v)} className="w-full flex items-center justify-between px-4 py-3 rounded-[14px] mb-2 transition hover:opacity-80" style={{ background: '#0A0F1E' }}>
              <div className="flex items-center gap-2">
                <Terminal size={14} color="#E2E8F2" />
                <span className="text-[12.5px] font-700" style={{ color: '#E2E8F2' }}>Build Output</span>
                {status !== 'idle' && <StatusPill status={status === 'building' ? 'building' : status === 'success' ? 'success' : 'failed'} />}
              </div>
              {showLogs ? <ChevronUp size={14} color="#8E9BAD" /> : <ChevronDown size={14} color="#8E9BAD" />}
            </button>
            <div className="log-block max-h-72 overflow-y-auto">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
              {status === 'building' && <div className="flex items-center gap-2 mt-1"><Loader2 size={12} className="animate-spin" color="#60A5FA" /> Processing…</div>}
            </div>
          </div>
        )}

        {/* Result */}
        {result?.ok && (
          <div className="mt-4 card p-4" style={{ border: '1.5px solid #30D158', background: '#EDFAF2' }}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} color="#30D158" />
              <span className="text-[13px] font-700" style={{ color: '#1A7A3C' }}>Deployment successful!</span>
            </div>
            {result.url && (
              <a href={result.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] font-600" style={{ color: '#0A84FF' }}>
                {result.url} <ExternalLink size={13} />
              </a>
            )}
            {result.renderDeployUrl && (
              <a href={result.renderDeployUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] font-600 mt-2" style={{ color: '#0A84FF' }}>
                Deploy on Render → <ExternalLink size={13} />
              </a>
            )}
            {result.recommendation && (
              <div className="mt-3 text-[11.5px] space-y-1" style={{ color: '#2D6A4F' }}>
                <div>Framework: <strong>{result.recommendation.framework}</strong></div>
                <div>Build: <code>{result.recommendation.buildCommand}</code></div>
                <div>Output: <code>{result.recommendation.outputDirectory}</code></div>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
