import { Cloud, Gauge, Home, KeyRound, Settings } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/deployments', label: 'Projects', icon: Cloud },
  { href: '/providers', label: 'Keys', icon: KeyRound },
  { href: '/limits', label: 'Limits', icon: Gauge },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [pathname] = useLocation();
  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] pl-[62px]">
      <aside className="fixed bottom-4 left-2 top-4 z-40 flex w-[50px] flex-col items-center rounded-[26px] border border-white/80 bg-white/82 px-1.5 py-2 shadow-soft backdrop-blur-2xl" style={{ background: 'rgba(255,255,255,0.82)', borderColor: 'rgba(231,236,243,0.95)' }}>
        <Link href="/real" aria-label="Deploy" className="mb-2 grid h-11 w-11 place-items-center rounded-[20px] text-white active:scale-95" style={{ background: '#0A84FF', boxShadow: '0 10px 35px rgba(10,132,255,0.14)' }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </Link>
        <div className="mb-2 h-px w-8" style={{ background: '#E7ECF3' }} />
        <nav className="flex flex-1 flex-col items-center justify-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} aria-label={tab.label} title={tab.label} className={`grid h-10 w-10 place-items-center rounded-[18px] transition ${active ? 'text-blue-600' : 'text-slate-500'}`} style={active ? { background: '#EEF6FF', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : {}}>
                <Icon size={20} />
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-h-screen pb-8 pr-3">{children}</section>
    </main>
  );
}
