import { Shell } from '@/components/Shell';
import { ExternalLink, Globe, CheckCircle2, AlertCircle, Plus } from 'lucide-react';

const PROVIDERS = [
  { name: 'GitHub', desc: 'Source control & Pages hosting', icon: '🐙', color: '#0A0F1E', url: 'https://github.com/settings/tokens', status: 'connected', features: ['Repos', 'Pages', 'Actions'] },
  { name: 'Render', desc: 'Cloud app & API hosting', icon: '🟣', color: '#7C3AED', url: 'https://dashboard.render.com', status: 'disconnected', features: ['Web Services', 'Static Sites', 'Cron Jobs'] },
  { name: 'Cloudflare', desc: 'DNS, SSL & CDN', icon: '🟠', color: '#F6821F', url: 'https://dash.cloudflare.com', status: 'disconnected', features: ['DNS', 'SSL', 'Pages'] },
  { name: 'Docker Hub', desc: 'Container registry', icon: '🐳', color: '#2496ED', url: 'https://hub.docker.com', status: 'disconnected', features: ['Images', 'Registry', 'Build'] },
  { name: 'Vercel', desc: 'Frontend deployments', icon: '▲', color: '#0A0F1E', url: 'https://vercel.com/account/tokens', status: 'disconnected', features: ['Edge', 'Serverless', 'Analytics'] },
  { name: 'Supabase', desc: 'Postgres & Auth backend', icon: '⚡', color: '#3ECF8E', url: 'https://app.supabase.com', status: 'disconnected', features: ['Database', 'Auth', 'Storage'] },
];

export default function Providers() {
  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-4xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Providers</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Connect cloud providers to unlock deployment targets</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
            <Plus size={14} /> Add Provider
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROVIDERS.map(p => (
            <div key={p.name} className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <div className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>{p.name}</div>
                    <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{p.desc}</div>
                  </div>
                </div>
                {p.status === 'connected'
                  ? <CheckCircle2 size={16} color="#30D158" />
                  : <AlertCircle size={16} color="#CBD5E1" />}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {p.features.map(f => (
                  <span key={f} className="px-2 py-0.5 rounded-full text-[11px] font-500" style={{ background: '#F0F3F8', color: '#5E6E85' }}>{f}</span>
                ))}
              </div>

              <a href={p.url} target="_blank" rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-[12.5px] font-700 transition hover:opacity-80"
                style={p.status === 'connected'
                  ? { background: '#EDFAF2', color: '#1A7A3C' }
                  : { background: '#F0F3F8', color: '#5E6E85' }}>
                {p.status === 'connected' ? 'Manage' : 'Connect'} <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>

        <div className="mt-6 card p-5" style={{ background: 'linear-gradient(135deg, rgba(10,132,255,0.06), rgba(94,92,230,0.06))', border: '1.5px solid rgba(10,132,255,0.15)' }}>
          <div className="flex items-center gap-3 mb-2">
            <Globe size={18} color="#0A84FF" />
            <span className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>Runtime Providers</span>
          </div>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>
            Danny's Cloud OS uses a pluggable runtime model. Connect your own VPS, Docker host, or Kubernetes cluster to run containers on your own infrastructure. Coming soon: one-click VPS provisioning.
          </p>
        </div>
      </div>
    </Shell>
  );
}
