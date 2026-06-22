import { useState } from 'react';
import { ExternalLink, Gauge, ShieldAlert } from 'lucide-react';
import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';

export default function LimitsPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<any>(null);

  async function check() {
    const res = await fetch('/api/real/limits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ githubToken: token }),
      credentials: 'include',
    });
    setData(await res.json());
  }

  return (
    <Shell>
      <PhoneHeader title="Limits" subtitle="Real quota guard" />
      <section className="px-5">
        <div className="rounded-[32px] bg-white p-5 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="flex items-center gap-3">
            <Gauge style={{ color: '#006BE6' }} />
            <div>
              <h2 className="text-xl font-black">Provider limit monitor</h2>
              <p className="text-sm" style={{ color: '#65758B' }}>Checks official provider signals. It will not bypass free-tier rules.</p>
            </div>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="GitHub token to check real rate limit"
            className="mt-4 h-14 w-full rounded-3xl border px-4 outline-none focus:border-blue-500"
            style={{ borderColor: '#E7ECF3' }}
          />
          <button onClick={check} className="mt-3 h-14 w-full rounded-3xl font-black text-white" style={{ background: '#0A84FF' }}>Check real limits</button>
        </div>
      </section>

      {data?.limits?.length > 0 && (
        <section className="mt-5 space-y-3 px-5">
          {data.limits.map((l: any) => (
            <div key={l.provider + l.metric} className="rounded-[30px] bg-white p-4 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black">{l.provider}</h3>
                  <p className="text-sm" style={{ color: '#65758B' }}>{l.metric}</p>
                </div>
                <StatusPill tone={l.state === 'ok' ? 'success' : l.state === 'critical' ? 'warn' : 'info'}>{l.state}</StatusPill>
              </div>
              {typeof l.remaining === 'number' && (
                <div className="mt-4 h-3 rounded-full" style={{ background: '#F6F8FB' }}>
                  <div className="h-3 rounded-full" style={{ width: `${Math.max(4, Math.min(100, (l.remaining / l.limit) * 100))}%`, background: '#0A84FF' }} />
                </div>
              )}
              <p className="mt-3 text-sm leading-6" style={{ color: '#65758B' }}>{l.note}</p>
              <p className="mt-2 text-sm font-bold" style={{ color: '#07111F' }}>Action: {l.action}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-5 px-5">
        <div className="rounded-[32px] p-5 ring-1" style={{ background: '#FFFBEB', color: '#D97706', outline: '1px solid #FDE68A' }}>
          <ShieldAlert />
          <h3 className="mt-3 text-lg font-black">No account-limit evasion</h3>
          <p className="mt-2 text-sm leading-6">Nezora can alert, pause, clean up, and fail over to providers you legitimately connect. It cannot auto-create new third-party accounts to bypass free-tier limits or provider terms.</p>
        </div>
      </section>

      <section className="mt-5 space-y-3 px-5 pb-6">
        {[
          ['Render usage/dashboard', 'https://dashboard.render.com/'],
          ['GitHub tokens', 'https://github.com/settings/personal-access-tokens'],
          ['UptimeRobot free monitors', 'https://uptimerobot.com/'],
          ['cron-job.org scheduled pings', 'https://cron-job.org/'],
        ].map(([title, href]) => (
          <a key={title} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-[28px] bg-white p-4 font-black shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
            {title}<ExternalLink style={{ color: '#006BE6' }} />
          </a>
        ))}
      </section>
    </Shell>
  );
}
