import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Save, KeyRound, Shield, Bell, User, Palette, Terminal, ExternalLink, CheckCircle2 } from 'lucide-react';

export default function Settings() {
  const [ghToken, setGhToken] = useState('');
  const [ghOwner, setGhOwner] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setGhToken(localStorage.getItem('gh_token') || '');
    setGhOwner(localStorage.getItem('gh_owner') || '');
  }, []);

  function save() {
    localStorage.setItem('gh_token', ghToken);
    localStorage.setItem('gh_owner', ghOwner);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const sections = [
    {
      title: 'GitHub Integration',
      icon: KeyRound,
      color: '#0A84FF',
      content: (
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Personal Access Token</label>
            <input className="field" type="password" placeholder="ghp_xxxxxxxxxxxx" value={ghToken} onChange={e => setGhToken(e.target.value)} />
            <p className="text-[11px] mt-1.5" style={{ color: '#8E9BAD' }}>Needs: repo, workflow, pages permissions</p>
          </div>
          <div>
            <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Default Owner / Username</label>
            <input className="field" placeholder="your-github-username" value={ghOwner} onChange={e => setGhOwner(e.target.value)} />
          </div>
          <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-600" style={{ color: '#0A84FF' }}>
            Generate token on GitHub <ExternalLink size={12} />
          </a>
        </div>
      ),
    },
    {
      title: 'Admin Security',
      icon: Shield,
      color: '#30D158',
      content: (
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-[14px]" style={{ background: '#EDFAF2', border: '1px solid #A8EDC0' }}>
            <div className="text-[12.5px] font-600" style={{ color: '#1A7A3C' }}>Single-owner mode active</div>
            <div className="text-[12px] mt-0.5" style={{ color: '#2D6A4F' }}>Only requests with the correct ADMIN_TOKEN are accepted.</div>
          </div>
          <div>
            <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>ADMIN_TOKEN (server env var)</label>
            <input className="field" type="password" placeholder="Set in Render environment variables" disabled style={{ background: '#F5F8FC', cursor: 'not-allowed' }} />
            <p className="text-[11px] mt-1.5" style={{ color: '#8E9BAD' }}>Set ADMIN_TOKEN in your Render service environment — never expose in client code.</p>
          </div>
        </div>
      ),
    },
    {
      title: 'Platform Info',
      icon: Terminal,
      color: '#5E5CE6',
      content: (
        <div className="space-y-2.5">
          {[
            ['Platform', "Danny's Cloud OS v2"],
            ['Stack', 'Vite + React + Express 5'],
            ['Node.js', process.env.NODE_ENV || 'development'],
            ['Build Engine', 'esbuild + auto-detect'],
            ['AI Backend', 'Groq (free LLM)'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#F0F3F8' }}>
              <span className="text-[12.5px]" style={{ color: '#5E6E85' }}>{k}</span>
              <span className="text-[12.5px] font-600" style={{ color: '#0A0F1E' }}>{v}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-3xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Settings</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Configure your Cloud OS preferences</p>
          </div>
          <button onClick={save} className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white transition-all active:scale-[0.98]"
            style={{ background: saved ? '#30D158' : 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 12px rgba(10,132,255,0.3)' }}>
            {saved ? <><CheckCircle2 size={14} /> Saved!</> : <><Save size={14} /> Save</>}
          </button>
        </div>

        <div className="space-y-4">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: `${s.color}18` }}>
                    <Icon size={16} style={{ color: s.color }} />
                  </div>
                  <span className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>{s.title}</span>
                </div>
                {s.content}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
