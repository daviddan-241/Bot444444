'use client';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileArchive, Github, Loader2, Play, ServerCog, TerminalSquare, UploadCloud } from 'lucide-react';
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

  const canDeployRepo = owner && repo && token;
  const canDeployZip = zipTarget === 'instant' ? Boolean(zipFile) : Boolean(canDeployRepo && zipFile);
  const allCommands = useMemo(() => result?.commands ?? [], [result]);

  useEffect(() => {
    setOwner(localStorage.getItem('nezora.githubOwner') || '');
    setBranch(localStorage.getItem('nezora.defaultBranch') || 'main');
    setToken(localStorage.getItem('nezora.githubToken') || '');
  }, []);

  function startSteps(upload = false) {
    setSteps([
      { label: upload ? 'Upload ZIP safely' : 'Connect to GitHub repository', state: 'active' },
      { label: 'Detect framework and commands', state: 'idle' },
      { label: 'Run install/build process', state: 'idle' },
      { label: upload && zipTarget === 'render' ? 'Prepare Render Blueprint' : zipTarget === 'instant' ? 'Publish on Nezora temporary host' : 'Publish deployment target', state: 'idle' },
      { label: 'Return public URL or deploy link', state: 'idle' }
    ]);
  }

  function completeSteps(ok: boolean) {
    setSteps((old) => old.map((step, index) => ({ ...step, state: ok ? 'done' : index === old.length - 1 ? 'error' : 'done' })));
  }

  async function deployRepo() {
    if (!canDeployRepo) return;
    setBusy(true); setResult(null); startSteps(false);
    const res = await fetch('/api/real/github-pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, owner, repo, branch, autoFix: true }) });
    const data = await res.json();
    setResult(data); completeSteps(Boolean(data.ok)); setBusy(false);
  }

  async function deployZip() {
    if (!canDeployZip || !zipFile) return;
    setBusy(true); setResult(null); startSteps(true);
    const fd = new FormData();
    fd.set('file', zipFile); fd.set('token', token); fd.set('owner', owner); fd.set('repo', repo || zipFile.name.replace(/\.zip$/i, '')); fd.set('projectName', repo || zipFile.name.replace(/\.zip$/i, '')); fd.set('branch', branch); fd.set('target', zipTarget); fd.set('kind', zipKind);
    const res = await fetch('/api/real/zip', { method: 'POST', body: fd });
    const data = await res.json();
    setResult(data); completeSteps(Boolean(data.ok)); setBusy(false);
  }

  async function runShell() {
    const res = await fetch('/api/system/shell', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(shell.includes(' ') ? { command: shell } : { preset: shell }) });
    const data = await res.json();
    setShellOut(JSON.stringify(data.result || data, null, 2));
  }

  return <Shell><PhoneHeader title="Deploy Center" subtitle="Plus button deploys here" />
    <section className="px-5"><div className="rounded-[36px] bg-ink p-6 text-white shadow-soft"><StatusPill tone="success">Real build pipeline</StatusPill><h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Deploy from GitHub or ZIP.</h2><p className="mt-3 text-sm leading-6 text-white/70">Nezora runs real git, install, build, publish and provider handoff commands. The command output below is the deployment log.</p></div></section>

    <section className="mt-5 px-5"><div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Github className="text-blue-600" /><div><h3 className="text-xl font-black">1. Repository name</h3><p className="text-sm text-muted">GitHub owner, branch and token come from Settings.</p></div></div><StatusPill tone={owner && token ? 'success' : 'warn'}>{owner && token ? 'Profile ready' : 'Set profile'}</StatusPill></div><div className="mt-4"><Input label="Repository or project name" value={repo} set={setRepo} hint="my-project" /></div><p className="mt-3 text-xs leading-5 text-muted">Using owner: <b>{owner || 'not set'}</b>, branch: <b>{branch || 'main'}</b>. For no-token ZIP hosting, only a ZIP file and project name are required.</p></div></section>

    <section className="mt-5 px-5"><div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line"><div className="flex items-center gap-3"><UploadCloud className="text-blue-600" /><h3 className="text-xl font-black">2. Choose deploy action</h3></div><button onClick={deployRepo} disabled={busy || !canDeployRepo} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-3xl bg-blue-500 font-black text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Deploy GitHub repo to Pages</button><div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-line" /><span className="text-xs font-bold uppercase tracking-wider text-muted">or upload ZIP</span><div className="h-px flex-1 bg-line" /></div><input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] || null)} className="block w-full rounded-3xl border border-line bg-cloud p-4 text-sm" /><div className="mt-3 grid grid-cols-2 gap-3"><label className="block"><span className="text-xs font-bold uppercase tracking-wider text-muted">Target</span><select value={zipTarget} onChange={(e) => setZipTarget(e.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-line bg-white px-3"><option value="instant">Instant Temporary URL</option><option value="pages">GitHub Pages</option><option value="render">Render Blueprint</option></select></label><label className="block"><span className="text-xs font-bold uppercase tracking-wider text-muted">Project type</span><select value={zipKind} onChange={(e) => setZipKind(e.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-line bg-white px-3"><option value="web">Web app</option><option value="api">API</option><option value="bot">Bot</option><option value="worker">Worker</option><option value="static">Static site</option></select></label></div><button onClick={deployZip} disabled={busy || !canDeployZip} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-3xl bg-ink font-black text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <FileArchive size={18} />} Deploy ZIP</button></div></section>

    {(steps.length > 0 || result) && <section className="mt-5 px-5"><div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line"><div className="flex items-center justify-between"><h3 className="text-xl font-black">Real progress</h3><StatusPill tone={result?.ok ? 'success' : result ? 'warn' : 'info'}>{result ? (result.ok ? 'Complete' : 'Needs attention') : 'Running'}</StatusPill></div><div className="mt-4 space-y-2">{steps.map((step) => <div key={step.label} className="flex items-center gap-3 rounded-3xl bg-cloud p-3 text-sm"><StepIcon state={step.state} /><span className="font-semibold">{step.label}</span></div>)}</div>{result && <ResultCard result={result} />}{allCommands.length > 0 && <CommandLogs commands={allCommands} />}</div></section>}

    <section className="mt-5 px-5"><div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line"><div className="flex items-center gap-3"><TerminalSquare className="text-blue-600" /><h3 className="text-xl font-black">Linux operations</h3></div><p className="mt-2 text-sm leading-6 text-muted">Runs inside your Render Docker container for troubleshooting and repair.</p><input value={shell} onChange={(e) => setShell(e.target.value)} className="mt-4 h-14 w-full rounded-3xl border border-line px-4" placeholder="doctor, build, repair, network, render, files" /><button onClick={runShell} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-3xl bg-cloud font-black text-ink"><ServerCog size={18} /> Run command</button>{shellOut && <pre className="mt-4 max-h-96 overflow-auto rounded-3xl bg-ink p-4 text-xs text-white whitespace-pre-wrap">{shellOut}</pre>}</div></section>
  </Shell>;
}

function Input({ label, value, set, hint, secret }: { label: string; value: string; set: (v: string) => void; hint: string; secret?: boolean }) { return <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span><input type={secret ? 'password' : 'text'} value={value} onChange={(e) => set(e.target.value)} placeholder={hint} className="mt-1 h-12 w-full rounded-2xl border border-line px-3 text-sm outline-none focus:border-blue-500" /></label>; }
function StepIcon({ state }: { state: DeployStep['state'] }) { if (state === 'active') return <Loader2 className="animate-spin text-blue-600" size={18} />; if (state === 'error') return <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-amber-500 text-[10px] font-black text-white">!</span>; if (state === 'done') return <CheckCircle2 className="text-emerald-600" size={18} />; return <span className="h-[18px] w-[18px] rounded-full border-2 border-line" />; }
function ResultCard({ result }: { result: DeployResult }) { return <div className={`mt-4 rounded-3xl p-4 ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><p className="font-black">{result.message}</p>{result.recommendation && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Mini label="Detected" value={result.recommendation.framework} /><Mini label="Install" value={result.recommendation.installCommand} /><Mini label="Build" value={result.recommendation.buildCommand} /><Mini label="Output" value={result.recommendation.outputDirectory} /></div>}{result.url && <OutLink href={result.url} label={result.url} />}{result.repoUrl && <OutLink href={result.repoUrl} label={result.repoUrl} />}{result.renderDeployUrl && <OutLink href={result.renderDeployUrl} label="Open Render deploy flow" button />}</div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/70 p-3"><p className="font-bold opacity-70">{label}</p><p className="mt-1 truncate font-black">{value}</p></div>; }
function OutLink({ href, label, button }: { href: string; label: string; button?: boolean }) { return <a className={`mt-3 flex items-center gap-2 ${button ? 'rounded-2xl bg-blue-500 px-4 py-3 font-black text-white' : 'font-bold underline'}`} href={href} target="_blank">{label}<ExternalLink size={16} /></a>; }
function CommandLogs({ commands }: { commands: CommandLog[] }) { return <details className="mt-4"><summary className="cursor-pointer rounded-2xl bg-cloud px-4 py-3 font-black">Build and publish logs</summary><div className="mt-3 space-y-3">{commands.map((cmd, index) => <div key={`${cmd.command}-${index}`} className="overflow-hidden rounded-3xl bg-ink text-white"><div className="flex items-center justify-between bg-white/10 px-4 py-3 text-xs"><span className="truncate font-bold">{cmd.command}</span><span className={cmd.code === 0 ? 'text-emerald-300' : 'text-amber-300'}>exit {cmd.code}</span></div><pre className="max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs leading-5">{[cmd.stdout, cmd.stderr].filter(Boolean).join('\n') || 'No output.'}</pre></div>)}</div></details>; }
