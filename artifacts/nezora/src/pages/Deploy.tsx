import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileArchive, Github, Loader2, Play, ServerCog, Sparkles, TerminalSquare, UploadCloud } from 'lucide-react';
import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';

type CommandLog = { command: string; code: number; stdout: string; stderr: string };
type DeployResult = { ok: boolean; message: string; url?: string; repoUrl?: string; renderDeployUrl?: string; commands?: CommandLog[]; recommendation?: { framework: string; installCommand: string; buildCommand: string; startCommand: string; outputDirectory: string } };
type DeployStep = { label: string; state: 'done' | 'active' | 'idle' | 'error' };

export default function RealPage() {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipTarget, setZipTarget] = useState('instant');
  const [zipKind, setZipKind] = useState('web');
  const [result, setResult] = useState<DeployResult | null>(null);
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [shell, setShell] = useState('doctor');
  const [shellOut, setShellOut] = useState('');

  const canDeployRepo = Boolean(owner && repo && token);
  const canDeployZip = zipTarget === 'instant' ? Boolean(zipFile) : Boolean(owner && token && zipFile && repo);
  const commands = useMemo(() => result?.commands ?? [], [result]);

  useEffect(() => {
    setOwner(localStorage.getItem('nezora.githubOwner') || '');
    setBranch(localStorage.getItem('nezora.defaultBranch') || 'main');
    setToken(localStorage.getItem('nezora.githubToken') || '');
  }, []);

  function startSteps(upload = false) {
    setSteps([
      { label: upload ? 'Read ZIP' : 'Connect repo', state: 'active' },
      { label: 'Detect stack', state: 'idle' },
      { label: 'Install & build', state: 'idle' },
      { label: upload && zipTarget === 'render' ? 'Create Render handoff' : zipTarget === 'instant' ? 'Serve on Nezora' : 'Publish to Pages', state: 'idle' },
      { label: 'Return URL', state: 'idle' }
    ]);
  }
  function completeSteps(ok: boolean) {
    setSteps((old) => old.map((step, i) => ({ ...step, state: ok ? 'done' : i === old.length - 1 ? 'error' : 'done' })));
  }

  async function deployRepo() {
    if (!canDeployRepo) return;
    setBusy(true); setResult(null); startSteps(false);
    const res = await fetch('/api/real/github-pages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, owner, repo, branch, autoFix: true }),
      credentials: 'include',
    });
    const data = await res.json(); setResult(data); completeSteps(Boolean(data.ok)); setBusy(false);
  }

  async function deployZip() {
    if (!canDeployZip || !zipFile) return;
    setBusy(true); setResult(null); startSteps(true);
    const fd = new FormData();
    fd.set('file', zipFile);
    fd.set('token', token);
    fd.set('owner', owner);
    fd.set('repo', repo || zipFile.name.replace(/\.zip$/i, ''));
    fd.set('projectName', repo || zipFile.name.replace(/\.zip$/i, ''));
    fd.set('branch', branch);
    fd.set('target', zipTarget);
    fd.set('kind', zipKind);
    const res = await fetch('/api/real/zip', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json(); setResult(data); completeSteps(Boolean(data.ok)); setBusy(false);
  }

  async function runShell() {
    const res = await fetch('/api/system/shell', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shell.includes(' ') ? { command: shell } : { preset: shell }),
      credentials: 'include',
    });
    const data = await res.json(); setShellOut(JSON.stringify(data.result || data, null, 2));
  }

  return (
    <Shell>
      <PhoneHeader title="Deploy" subtitle="Real mobile deploys" />

      <section className="px-3">
        <div className="card overflow-hidden p-4">
          <div className="rounded-[22px] p-4 text-white" style={{ background: 'linear-gradient(135deg, #0A84FF, #0057b8)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.16em]" style={{ color: 'rgba(255,255,255,0.8)' }}><Sparkles size={13} /> Deploy Center</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Ship from repo or ZIP.</h2>
              </div>
              <StatusPill tone="neutral">Live</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.78)' }}>Real build commands, real logs, real URLs. Use Instant for temporary no-token static hosting.</p>
          </div>
        </div>
      </section>

      <section className="mt-3 px-3">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px]" style={{ background: '#EEF6FF', color: '#006BE6' }}><Github size={21} /></div>
              <div className="min-w-0">
                <h3 className="text-lg font-black tracking-[-.02em]">Project</h3>
                <p className="text-sm leading-5" style={{ color: '#65758B' }}>Owner/token are saved in Settings.</p>
              </div>
            </div>
            <StatusPill tone={owner && token ? 'success' : 'warn'}>{owner && token ? 'Ready' : 'Setup'}</StatusPill>
          </div>
          <div className="mt-4">
            <label className="text-[11px] font-black uppercase tracking-[.14em]" style={{ color: '#65758B' }}>Repo or project name</label>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="my-project" className="field mt-2" />
            <p className="mt-2 text-xs leading-5" style={{ color: '#65758B' }}>GitHub: <b>{owner || 'not set'}</b> · Branch: <b>{branch || 'main'}</b></p>
          </div>
        </div>
      </section>

      <section className="mt-3 px-3">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[18px]" style={{ background: '#ECFDF5', color: '#059669' }}><UploadCloud size={21} /></div>
            <div><h3 className="text-lg font-black">Deploy action</h3><p className="text-sm" style={{ color: '#65758B' }}>Choose a real target.</p></div>
          </div>

          <button onClick={deployRepo} disabled={busy || !canDeployRepo} className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] px-4 font-black text-white shadow-glass disabled:opacity-45" style={{ background: '#0A84FF', boxShadow: '0 10px 35px rgba(10,132,255,0.14)' }}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Repo → GitHub Pages
          </button>

          <div className="my-4 flex items-center gap-3"><span className="h-px flex-1" style={{ background: '#E7ECF3' }} /><span className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: '#65758B' }}>ZIP</span><span className="h-px flex-1" style={{ background: '#E7ECF3' }} /></div>

          <label className="flex min-h-[58px] cursor-pointer items-center justify-between gap-3 rounded-[22px] border border-dashed px-4 py-3" style={{ borderColor: '#93C5FD', background: 'rgba(238,246,255,0.55)' }}>
            <div className="min-w-0">
              <p className="font-black" style={{ color: '#07111F' }}>{zipFile ? zipFile.name : 'Choose ZIP file'}</p>
              <p className="text-xs" style={{ color: '#65758B' }}>Static sites can use Instant URL.</p>
            </div>
            <FileArchive className="shrink-0" style={{ color: '#006BE6' }} />
            <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] || null)} className="hidden" />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: '#65758B' }}>Target</span>
              <select value={zipTarget} onChange={(e) => setZipTarget(e.target.value)} className="field mt-1">
                <option value="instant">Instant URL</option>
                <option value="pages">GitHub Pages</option>
                <option value="render">Render Link</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: '#65758B' }}>Type</span>
              <select value={zipKind} onChange={(e) => setZipKind(e.target.value)} className="field mt-1">
                <option value="web">Web</option>
                <option value="static">Static</option>
                <option value="api">API</option>
                <option value="bot">Bot</option>
                <option value="worker">Worker</option>
              </select>
            </label>
          </div>

          <button onClick={deployZip} disabled={busy || !canDeployZip} className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] px-4 font-black text-white disabled:opacity-45" style={{ background: '#07111F' }}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <FileArchive size={18} />} Deploy ZIP
          </button>
        </div>
      </section>

      {(steps.length > 0 || result) && (
        <section className="mt-3 px-3">
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black">Progress</h3>
              <StatusPill tone={result?.ok ? 'success' : result ? 'warn' : 'info'}>{result ? (result.ok ? 'Complete' : 'Fix needed') : 'Running'}</StatusPill>
            </div>
            <div className="mt-3 grid gap-2">
              {steps.map((step) => (
                <div key={step.label} className="flex items-center gap-3 rounded-[20px] px-3 py-3 text-sm" style={{ background: '#F6F8FB' }}>
                  <StepIcon state={step.state} />
                  <span className="font-bold">{step.label}</span>
                </div>
              ))}
            </div>
            {result && <ResultCard result={result} />}
            {commands.length > 0 && <CommandLogs commands={commands} />}
          </div>
        </section>
      )}

      <section className="mt-3 px-3 pb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[18px]" style={{ background: '#EEF6FF', color: '#006BE6' }}><TerminalSquare size={21} /></div>
            <div><h3 className="text-lg font-black">Linux operations</h3><p className="text-sm" style={{ color: '#65758B' }}>Docker container tools.</p></div>
          </div>
          <input value={shell} onChange={(e) => setShell(e.target.value)} className="field mt-4" placeholder="doctor, repair, network, files" />
          <button onClick={runShell} className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] font-black" style={{ background: '#F6F8FB', color: '#07111F' }}>
            <ServerCog size={18} /> Run command
          </button>
          {shellOut && <pre className="mt-3 max-h-80 overflow-auto rounded-[22px] p-4 text-xs leading-5 text-white whitespace-pre-wrap" style={{ background: '#07111F' }}>{shellOut}</pre>}
        </div>
      </section>
    </Shell>
  );
}

function StepIcon({ state }: { state: DeployStep['state'] }) {
  if (state === 'active') return <Loader2 className="animate-spin" size={18} style={{ color: '#006BE6' }} />;
  if (state === 'error') return <AlertCircle size={18} style={{ color: '#D97706' }} />;
  if (state === 'done') return <CheckCircle2 size={18} style={{ color: '#059669' }} />;
  return <span className="h-[18px] w-[18px] rounded-full border-2" style={{ borderColor: '#E7ECF3' }} />;
}

function ResultCard({ result }: { result: DeployResult }) {
  return (
    <div className="mt-3 rounded-[22px] p-4" style={{ background: result.ok ? '#ECFDF5' : '#FFFBEB', color: result.ok ? '#059669' : '#D97706' }}>
      <p className="font-black leading-6">{result.message}</p>
      {result.recommendation && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Mini label="Stack" value={result.recommendation.framework} />
          <Mini label="Install" value={result.recommendation.installCommand} />
          <Mini label="Build" value={result.recommendation.buildCommand} />
          <Mini label="Output" value={result.recommendation.outputDirectory} />
        </div>
      )}
      {result.url && <OutLink href={result.url} label="Open public URL" />}
      {result.repoUrl && <OutLink href={result.repoUrl} label="Open GitHub repo" />}
      {result.renderDeployUrl && <OutLink href={result.renderDeployUrl} label="Open Render deploy" />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] p-3" style={{ background: 'rgba(255,255,255,0.75)' }}>
      <p className="font-bold opacity-70">{label}</p>
      <p className="mt-1 truncate font-black">{value}</p>
    </div>
  );
}

function OutLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="mt-3 flex min-h-[44px] items-center justify-between rounded-[16px] px-4 font-black text-white" href={href} target="_blank" rel="noopener noreferrer" style={{ background: '#0A84FF' }}>
      <span>{label}</span><ExternalLink size={16} />
    </a>
  );
}

function CommandLogs({ commands }: { commands: CommandLog[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer rounded-[18px] px-4 py-3 font-black" style={{ background: '#F6F8FB' }}>Command logs</summary>
      <div className="mt-3 space-y-2">
        {commands.map((cmd, i) => (
          <div key={`${cmd.command}-${i}`} className="overflow-hidden rounded-[20px] text-white" style={{ background: '#07111F' }}>
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <span className="truncate font-bold">{cmd.command}</span>
              <span style={{ color: cmd.code === 0 ? '#6EE7B7' : '#FCD34D' }}>{cmd.code}</span>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-5">{[cmd.stdout, cmd.stderr].filter(Boolean).join('\n') || 'No output.'}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}
