'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Gauge, ShieldAlert } from 'lucide-react';
import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';

export default function LimitsPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<any>(null);
  async function check() {
    const res = await fetch('/api/real/limits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ githubToken: token }) });
    setData(await res.json());
  }
  return <Shell><PhoneHeader title="Limits" subtitle="Real quota guard" />
    <section className="px-5"><div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line"><div className="flex items-center gap-3"><Gauge className="text-blue-600" /><div><h2 className="text-xl font-black">Provider limit monitor</h2><p className="text-sm text-muted">Checks official provider signals. It will not bypass free-tier rules.</p></div></div><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="GitHub token to check real rate limit" className="mt-4 h-14 w-full rounded-3xl border border-line px-4 outline-none focus:border-blue-500" /><button onClick={check} className="mt-3 h-14 w-full rounded-3xl bg-blue-500 font-black text-white">Check real limits</button></div></section>
    {data?.limits?.length > 0 && <section className="mt-5 space-y-3 px-5">{data.limits.map((l: any) => <div key={l.provider + l.metric} className="rounded-[30px] bg-white p-4 shadow-soft ring-1 ring-line"><div className="flex items-start justify-between"><div><h3 className="font-black">{l.provider}</h3><p className="text-sm text-muted">{l.metric}</p></div><StatusPill tone={l.state === 'ok' ? 'success' : l.state === 'critical' ? 'warn' : 'info'}>{l.state}</StatusPill></div>{typeof l.remaining === 'number' && <div className="mt-4 h-3 rounded-full bg-cloud"><div className="h-3 rounded-full bg-blue-500" style={{ width: `${Math.max(4, Math.min(100, (l.remaining / l.limit) * 100))}%` }} /></div>}<p className="mt-3 text-sm leading-6 text-muted">{l.note}</p><p className="mt-2 text-sm font-bold text-ink">Action: {l.action}</p></div>)}</section>}
    <section className="mt-5 px-5"><div className="rounded-[32px] bg-amber-50 p-5 text-amber-700 ring-1 ring-amber-100"><ShieldAlert /><h3 className="mt-3 text-lg font-black">No account-limit evasion</h3><p className="mt-2 text-sm leading-6">Nezora can alert, pause, clean up, and fail over to providers you legitimately connect. It cannot auto-create new third-party accounts to bypass free-tier limits or provider terms.</p></div></section>
    <section className="mt-5 space-y-3 px-5"><Link href="https://dashboard.render.com/" title="Render usage/dashboard" /><Link href="https://github.com/settings/personal-access-tokens" title="GitHub tokens" /><Link href="https://uptimerobot.com/" title="UptimeRobot free monitors" /><Link href="https://cron-job.org/" title="cron-job.org scheduled pings" /></section>
  </Shell>;
}
function Link({ href, title }: { href: string; title: string }) { return <a href={href} target="_blank" className="flex items-center justify-between rounded-[28px] bg-white p-4 font-black shadow-soft ring-1 ring-line">{title}<ExternalLink className="text-blue-600" /></a>; }
