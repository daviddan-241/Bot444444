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
    <main className="mx-auto min-h-screen w-full max-w-[560px] pl-[78px]">
      <aside className="glass fixed bottom-3 left-3 top-3 z-40 flex w-[62px] flex-col items-center rounded-[30px] px-2 py-3 shadow-soft">
        <Link href="/real" aria-label="Deploy" className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-500 text-white shadow-glass active:scale-95">
          <Plus size={26} strokeWidth={2.8} />
        </Link>
        <div className="h-px w-9 bg-line" />
        <nav className="mt-3 flex flex-1 flex-col items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} aria-label={tab.label} title={tab.label} className={`grid h-11 w-11 place-items-center rounded-2xl transition ${active ? 'bg-blue-50 text-blue-600' : 'text-muted active:bg-cloud'}`}>
                <Icon size={21} />
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-h-screen pb-8 pr-4">{children}</section>
    </main>
  );
}
