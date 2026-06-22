import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Save, ShieldCheck, TerminalSquare } from 'lucide-react';
import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';

const credentials = [
  { name: 'GitHub fine-grained token', url: 'https://github.com/settings/personal-access-tokens', use: 'Required for GitHub Pages and Render Blueprint repo preparation.', perms: 'Selected repos. Contents read/write, Pages read/write, Metadata read.' },
  { name: 'Render dashboard', url: 'https://dashboard.render.com/', use: 'Host Nezora itself and deploy prepared Blueprint projects.', perms: 'No Render API key needed for the deploy-link flow.' },
  { name: 'Render API key', url: 'https://dashboard.render.com/account/api-keys', use: 'Optional future direct Render automation.', perms: 'Create from Account Settings.' },
  { name: 'Cloudflare API token', url: 'https://dash.cloudflare.com/profile/api-tokens', use: 'Optional DNS/Pages automation with your own domain.', perms: 'Least privilege: Pages edit, DNS edit for selected zone.' },
  { name: 'Vercel token', url: 'https://vercel.com/account/tokens', use: 'Optional direct Next.js/frontend deployments.', perms: 'Limit team scope where possible.' },
  { name: 'Koyeb API token', url: 'https://app.koyeb.com/account/api', use: 'Optional service/API adapter.', perms: 'Account API settings.' },
  { name: 'UptimeRobot', url: 'https://uptimerobot.com/', use: 'Free URL monitoring alerts.', perms: 'Free account.' },
  { name: 'cron-job.org', url: 'https://cron-job.org/', use: 'Scheduled HTTP pings for health endpoints.', perms: 'Use responsibly within provider rules.' },
];

export default function SettingsPage() {
  const [owner, setOwner] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOwner(localStorage.getItem('nezora.githubOwner') || '');
    setBranch(localStorage.getItem('nezora.defaultBranch') || 'main');
    setToken(localStorage.getItem('nezora.githubToken') || '');
  }, []);

  function save() {
    localStorage.setItem('nezora.githubOwner', owner.trim());
    localStorage.setItem('nezora.defaultBranch', branch.trim() || 'main');
    localStorage.setItem('nezora.githubToken', token.trim());
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  }

  return (
    <Shell>
      <PhoneHeader title="Settings" subtitle="Saved deploy profile" />

      <section className="px-5">
        <div className="rounded-[32px] bg-white p-5 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: '#006BE6' }}>Deploy profile</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Put your GitHub details once.</h2>
            </div>
            <StatusPill tone={saved ? 'success' : 'info'}>{saved ? 'Saved' : 'Local'}</StatusPill>
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: '#65758B' }}>After this, the plus Deploy Center only needs the repository name for GitHub flows. These values are saved in your browser on your private device.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="GitHub username/org" value={owner} set={setOwner} hint="daviddan-241" />
            <Field label="Default branch" value={branch} set={setBranch} hint="main" />
            <label className="col-span-2 block">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#65758B' }}>GitHub token</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="fine-grained PAT" className="mt-1 h-12 w-full rounded-2xl border px-3 text-sm outline-none focus:border-blue-500" style={{ borderColor: '#E7ECF3' }} />
            </label>
          </div>
          <button onClick={save} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-3xl font-black text-white" style={{ background: '#0A84FF' }}><Save size={18} /> Save deploy profile</button>
        </div>
      </section>

      <section className="mt-5 px-5">
        <div className="rounded-[32px] p-5 text-white shadow-soft" style={{ background: '#07111F', boxShadow: '0 18px 50px rgba(7,17,31,0.08)' }}>
          <StatusPill tone="success">No-token option</StatusPill>
          <h3 className="mt-4 text-xl font-black">Instant Temporary URL</h3>
          <p className="mt-2 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.70)' }}>ZIP static/frontend projects can be hosted directly by your Nezora Render container without any provider API. This is temporary container storage: it can disappear if Render restarts, redeploys or clears the instance.</p>
        </div>
      </section>

      <section className="mt-5 px-5">
        <div className="rounded-[32px] bg-white p-5 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="flex items-center gap-3">
            <ShieldCheck style={{ color: '#059669' }} />
            <div>
              <h3 className="text-xl font-black">No-API fallback methods</h3>
              <p className="text-sm" style={{ color: '#65758B' }}>These are real workflows with clear limits.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ['Instant Temporary URL', 'No API/account for static ZIP previews; stored on the running Nezora container for a limited time.'],
              ['Render Deploy Button', 'Nezora generates render.yaml and a Render deploy link; you confirm in Render.'],
              ['Dockerfile export', 'This platform has a production Dockerfile for any Docker host.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-3xl p-4" style={{ background: '#F6F8FB' }}>
                <p className="font-black">{title}</p>
                <p className="mt-1 text-sm leading-5" style={{ color: '#65758B' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-3 px-5">
        {credentials.map((item) => (
          <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-[30px] bg-white p-4 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: '#EEF6FF', color: '#006BE6' }}><KeyRound /></div>
                <div>
                  <h2 className="font-black">{item.name}</h2>
                  <p className="mt-1 text-sm leading-5" style={{ color: '#65758B' }}>{item.use}</p>
                  <p className="mt-2 text-xs font-bold leading-5" style={{ color: '#07111F' }}>{item.perms}</p>
                </div>
              </div>
              <ExternalLink className="shrink-0" style={{ color: '#006BE6' }} />
            </div>
          </a>
        ))}
      </section>

      <section className="mt-5 px-5 pb-6">
        <div className="rounded-[32px] bg-white p-5 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="flex items-center gap-3"><TerminalSquare style={{ color: '#006BE6' }} /><h3 className="text-xl font-black">Render Docker env</h3></div>
          <pre className="mt-4 overflow-auto rounded-3xl p-4 text-xs leading-5" style={{ background: '#F6F8FB' }}>{`ADMIN_TOKEN=your-private-login-token\nALLOW_SHELL=false\nNEZORA_BASE_DOMAIN=your-domain-if-you-own-one`}</pre>
        </div>
      </section>
    </Shell>
  );
}

function Field({ label, value, set, hint }: { label: string; value: string; set: (v: string) => void; hint: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#65758B' }}>{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={hint} className="mt-1 h-12 w-full rounded-2xl border px-3 text-sm outline-none focus:border-blue-500" style={{ borderColor: '#E7ECF3' }} />
    </label>
  );
}
