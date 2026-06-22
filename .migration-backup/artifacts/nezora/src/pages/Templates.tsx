import { Shell } from '@/components/Shell';
import { Zap, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

const TEMPLATES = [
  { id: 'discord-bot', name: 'Discord Bot', desc: 'Node.js bot with slash commands', icon: '🤖', tags: ['Node.js', 'Bot'], color: '#5865F2' },
  { id: 'node-api', name: 'Node.js REST API', desc: 'Express + TypeScript API', icon: '🟢', tags: ['Node.js', 'API'], color: '#339933' },
  { id: 'react-vite', name: 'React + Vite', desc: 'Modern frontend SPA', icon: '⚛️', tags: ['React', 'Frontend'], color: '#61DAFB' },
  { id: 'nextjs', name: 'Next.js App', desc: 'Full-stack React framework', icon: '▲', tags: ['Next.js', 'SSR'], color: '#0A0F1E' },
  { id: 'fastapi', name: 'FastAPI', desc: 'Python async REST API', icon: '🐍', tags: ['Python', 'API'], color: '#009688' },
  { id: 'telegram-bot', name: 'Telegram Bot', desc: 'Python Telegram bot', icon: '✈️', tags: ['Python', 'Bot'], color: '#0088CC' },
  { id: 'laravel', name: 'Laravel', desc: 'PHP MVC framework', icon: '🎨', tags: ['PHP', 'Web'], color: '#FF2D20' },
  { id: 'wordpress', name: 'WordPress', desc: 'CMS platform', icon: '📝', tags: ['PHP', 'CMS'], color: '#21759B' },
  { id: 'portfolio', name: 'Portfolio', desc: 'Static HTML/CSS site', icon: '🌐', tags: ['Static', 'HTML'], color: '#F59E0B' },
  { id: 'blog', name: 'Blog', desc: 'Markdown-powered blog', icon: '📖', tags: ['Static', 'Blog'], color: '#8B5CF6' },
  { id: 'ecommerce', name: 'E-Commerce', desc: 'Stripe-powered shop', icon: '🛒', tags: ['React', 'Commerce'], color: '#10B981' },
  { id: 'saas-starter', name: 'SaaS Starter', desc: 'Auth + billing + dashboard', icon: '🚀', tags: ['React', 'SaaS'], color: '#0A84FF' },
];

export default function Templates() {
  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Templates</h1>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>One-click deployments — auto-configured and ready to go</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map(t => (
            <div key={t.id} className="card card-hover p-5 cursor-pointer" onClick={() => {}}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl">{t.icon}</div>
                <div>
                  <div className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>{t.name}</div>
                  <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{t.desc}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {t.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] font-500" style={{ background: `${t.color}15`, color: t.color }}>{tag}</span>
                ))}
              </div>
              <Link href="/deploy" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-[13px] font-700 text-white transition" style={{ background: t.color }}>
                <Zap size={13} /> Deploy now <ArrowRight size={13} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
