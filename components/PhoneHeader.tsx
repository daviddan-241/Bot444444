import { Bell, Sparkles } from 'lucide-react';

export function PhoneHeader({ title = 'Nezora Deploy', subtitle = 'Private deploy OS' }: { title?: string; subtitle?: string }) {
  return (
    <header className="px-3 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-600"><Sparkles size={12} /> {subtitle}</p>
          <h1 className="mt-1 truncate text-[28px] font-black leading-tight tracking-[-0.045em] text-ink">{title}</h1>
        </div>
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-white shadow-soft ring-1 ring-line" aria-label="Notifications"><Bell size={20} /></button>
      </div>
    </header>
  );
}
