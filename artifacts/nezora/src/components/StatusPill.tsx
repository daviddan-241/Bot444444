type Status = 'running' | 'success' | 'failed' | 'building' | 'stopped' | 'pending' | 'warning';

const MAP: Record<Status, { dot: string; bg: string; text: string; label: string }> = {
  running:  { dot: '#30D158', bg: '#EDFAF2', text: '#1A7A3C', label: 'Running' },
  success:  { dot: '#30D158', bg: '#EDFAF2', text: '#1A7A3C', label: 'Success' },
  failed:   { dot: '#FF453A', bg: '#FFF0EF', text: '#C0392B', label: 'Failed' },
  building: { dot: '#FF9F0A', bg: '#FFF8EC', text: '#A85E00', label: 'Building' },
  stopped:  { dot: '#8E9BAD', bg: '#F2F4F7', text: '#4A5568', label: 'Stopped' },
  pending:  { dot: '#8E9BAD', bg: '#F2F4F7', text: '#4A5568', label: 'Pending' },
  warning:  { dot: '#FF9F0A', bg: '#FFF8EC', text: '#A85E00', label: 'Warning' },
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const s = MAP[status] || MAP.pending;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-600" style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: s.dot }} />
      {label ?? s.label}
    </span>
  );
}
