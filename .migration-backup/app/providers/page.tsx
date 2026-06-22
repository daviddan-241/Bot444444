import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { ExternalLink, KeyRound } from 'lucide-react';

const links = [
  ['GitHub token', 'Required for real repo/ZIP deployments', 'https://github.com/settings/personal-access-tokens'],
  ['Render dashboard', 'Host Nezora and deploy prepared apps', 'https://dashboard.render.com/'],
  ['Render API keys', 'For future direct Render API automation', 'https://dashboard.render.com/account/api-keys'],
  ['Cloudflare tokens', 'For DNS/Pages automation with your domain', 'https://dash.cloudflare.com/profile/api-tokens'],
  ['Vercel tokens', 'For future Next.js deployment adapter', 'https://vercel.com/account/tokens'],
  ['Koyeb tokens', 'For future API/service adapter', 'https://app.koyeb.com/account/api']
];

export default function ProvidersPage() {
  return <Shell><PhoneHeader title="Provider Hub" subtitle="Real credentials" /><section className="space-y-3 px-5">{links.map(([name, desc, href]) => <a key={name} href={href} target="_blank" className="block rounded-[30px] bg-white p-4 shadow-soft ring-1 ring-line"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><KeyRound /></div><div><h2 className="font-black">{name}</h2><p className="text-sm text-muted">{desc}</p></div></div><ExternalLink className="text-blue-600" /></div></a>)}</section></Shell>;
}
