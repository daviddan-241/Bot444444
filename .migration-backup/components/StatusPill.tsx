export function StatusPill({ tone = 'success', children }: { tone?: 'success' | 'warn' | 'info' | 'neutral'; children: React.ReactNode }) {
  const cls = {
    success: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    warn: 'bg-amber-50 text-amber-600 ring-amber-100',
    info: 'bg-blue-50 text-blue-600 ring-blue-100',
    neutral: 'bg-cloud text-muted ring-line'
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${cls}`}>{children}</span>;
}
