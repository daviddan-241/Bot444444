import { Bell, Sparkles } from 'lucide-react';

export function PhoneHeader({ title = 'Nezora Deploy', subtitle = 'One-tap deployments' }: { title?: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"><Sparkles size={14} /> {subtitle}</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-ink">{title}</h1>
        </div>
        <button className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-soft" aria-label="Notifications"><Bell size={21} /></button>
      </div>
    </header>
  );
}
