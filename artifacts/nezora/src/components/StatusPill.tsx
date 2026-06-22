export function StatusPill({ tone = 'success', children }: { tone?: 'success' | 'warn' | 'info' | 'neutral'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    success: { background: '#ECFDF5', color: '#059669', outline: '1px solid #A7F3D0' },
    warn: { background: '#FFFBEB', color: '#D97706', outline: '1px solid #FDE68A' },
    info: { background: '#EEF6FF', color: '#006BE6', outline: '1px solid #BFDBFE' },
    neutral: { background: '#F6F8FB', color: '#65758B', outline: '1px solid #E7ECF3' }
  };
  return <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold" style={styles[tone]}>{children}</span>;
}
