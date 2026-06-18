import { ArrowRight, CheckCircle2, CloudUpload, Gauge, Github, Lock, Rocket, Server, Settings, TerminalSquare, Upload } from 'lucide-react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { PhoneHeader } from '@/components/PhoneHeader';
import { StatusPill } from '@/components/StatusPill';

export default function Home() {
  return (
    <Shell>
      <PhoneHeader />
      <section className="px-5">
        <div className="rounded-[36px] bg-ink p-6 text-white shadow-soft">
          <StatusPill tone="success">Render Docker ready</StatusPill>
          <h2 className="mt-5 text-4xl font-black leading-[0.95] tracking-[-0.055em]">Your private deployment control plane.</h2>
          <p className="mt-4 text-sm leading-6 text-white/70">Host Nezora on Render, unlock it with your personal token, upload a ZIP or connect a GitHub repo, then deploy through real provider flows.</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[['Docker', 'runtime'], ['ZIP', 'uploads'], ['HTTPS', 'provider URLs']].map(([a, b]) => <div key={b} className="rounded-3xl bg-white/10 p-3 text-center"><p className="text-lg font-black">{a}</p><p className="text-xs text-white/60">{b}</p></div>)}
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <div className="grid gap-3">
          <Action href="/real" icon={<Rocket />} title="Deploy project" desc="GitHub repo or ZIP. Static projects go to GitHub Pages; apps/APIs/bots get Render Blueprint preparation." primary />
          <Action href="/settings" icon={<Settings />} title="Get API keys & setup" desc="Direct links and exact permissions for GitHub, Render, Cloudflare, Vercel, Koyeb, Northflank and monitors." />
          <Action href="/limits" icon={<Gauge />} title="Check provider limits" desc="Read real provider quota signals where APIs expose them, then slow down or fail over safely." />
        </div>
      </section>

      <section className="mt-6 px-5">
        <div className="rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black tracking-[-0.03em]">Real deployment paths</h3>
            <StatusPill tone="info">No hidden providers</StatusPill>
          </div>
          <div className="mt-4 space-y-3">
            <Path icon={<Github />} title="GitHub Pages" desc="Real static hosting for frontend projects with a GitHub token." />
            <Path icon={<Upload />} title="ZIP to GitHub Pages" desc="Upload a ZIP, build it, publish the output to a real gh-pages branch." />
            <Path icon={<Server />} title="ZIP to Render" desc="Generate render.yaml, push a GitHub repo, open Render's official deploy flow." />
            <Path icon={<TerminalSquare />} title="Private Linux ops" desc="Run doctor, build, typecheck, network, process, audit and repair commands inside your Render container." />
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 px-5">
        <Feature icon={<Lock />} title="ADMIN_TOKEN lock" />
        <Feature icon={<CloudUpload />} title="Safe ZIP extraction" />
        <Feature icon={<CheckCircle2 />} title="Real build logs" />
        <Feature icon={<Gauge />} title="Quota guard" />
      </section>
    </Shell>
  );
}

function Action({ href, icon, title, desc, primary }: { href: string; icon: React.ReactNode; title: string; desc: string; primary?: boolean }) {
  return <Link href={href} className={`flex items-center justify-between rounded-[30px] p-4 shadow-soft ring-1 ${primary ? 'bg-blue-500 text-white ring-blue-500' : 'bg-white text-ink ring-line'}`}><div className="flex items-center gap-3"><div className={`grid h-12 w-12 place-items-center rounded-2xl ${primary ? 'bg-white/15' : 'bg-blue-50 text-blue-600'}`}>{icon}</div><div><h3 className="font-black">{title}</h3><p className={`mt-1 text-sm leading-5 ${primary ? 'text-white/75' : 'text-muted'}`}>{desc}</p></div></div><ArrowRight /></Link>;
}
function Path({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) { return <div className="flex gap-3 rounded-3xl bg-cloud p-4"><div className="text-blue-600">{icon}</div><div><p className="font-black">{title}</p><p className="mt-1 text-sm leading-5 text-muted">{desc}</p></div></div>; }
function Feature({ icon, title }: { icon: React.ReactNode; title: string }) { return <div className="rounded-[28px] bg-white p-4 shadow-soft ring-1 ring-line"><div className="text-blue-500">{icon}</div><p className="mt-3 text-sm font-black">{title}</p></div>; }
