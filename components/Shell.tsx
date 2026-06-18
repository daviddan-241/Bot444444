'use client';
import { Cloud, Gauge, Home, KeyRound, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/deployments', label: 'Projects', icon: Cloud },
  { href: '/providers', label: 'Keys', icon: KeyRound },
  { href: '/limits', label: 'Limits', icon: Gauge },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] pl-[62px]">
      <aside className="fixed bottom-4 left-2 top-4 z-40 flex w-[50px] flex-col items-center rounded-[26px] border border-white/80 bg-white/82 px-1.5 py-2 shadow-soft backdrop-blur-2xl">
        <Link href="/real" aria-label="Deploy" className="mb-2 grid h-11 w-11 place-items-center rounded-[20px] bg-blue-500 text-white shadow-glass active:scale-95">
          <Plus size={25} strokeWidth={2.8} />
        </Link>
        <div className="mb-2 h-px w-8 bg-line" />
        <nav className="flex flex-1 flex-col items-center justify-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} aria-label={tab.label} title={tab.label} className={`grid h-10 w-10 place-items-center rounded-[18px] transition ${active ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 active:bg-cloud'}`}>
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
