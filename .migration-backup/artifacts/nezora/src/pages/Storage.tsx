import { Shell } from '@/components/Shell';
import { HardDrive, Upload, File, Folder, Trash2, Download, RefreshCw } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

export default function Storage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState({ used: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/storage`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setFiles(d.files || []); setUsage(d.usage || { used: 0, total: 0 }); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const usedPct = usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0;

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-4xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Storage</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>File storage, uploads and persistent volumes</p>
          </div>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
            <Upload size={14} /> Upload
          </button>
          <input ref={fileRef} type="file" className="hidden" multiple />
        </div>

        {/* Usage */}
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>Storage Usage</span>
            <span className="text-[12px]" style={{ color: '#8E9BAD' }}>{formatBytes(usage.used)} / {formatBytes(usage.total)}</span>
          </div>
          <div className="metric-bar" style={{ height: 8 }}>
            <div className="metric-bar-fill" style={{ width: `${usedPct}%`, background: usedPct > 80 ? '#FF453A' : '#0A84FF' }} />
          </div>
          <div className="text-[11.5px] mt-1.5" style={{ color: '#8E9BAD' }}>{usedPct}% used</div>
        </div>

        {/* File browser */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: '#E2E8F2' }}>
            <span className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>Files</span>
            <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
              <RefreshCw size={13} color="#8E9BAD" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center"><RefreshCw size={18} color="#CBD5E1" className="animate-spin mx-auto" /></div>
          ) : files.length === 0 ? (
            <div className="p-10 text-center">
              <HardDrive size={28} color="#CBD5E1" className="mx-auto mb-2" />
              <div className="text-[13px]" style={{ color: '#8E9BAD' }}>No files stored yet</div>
            </div>
          ) : files.map((f, i) => (
            <div key={f.name} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 ${i < files.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
              {f.type === 'dir' ? <Folder size={16} color="#FF9F0A" /> : <File size={16} color="#8E9BAD" />}
              <div className="flex-1 overflow-hidden">
                <div className="text-[13px] font-600 truncate" style={{ color: '#0A0F1E' }}>{f.name}</div>
                <div className="text-[11.5px]" style={{ color: '#8E9BAD' }}>{f.type === 'dir' ? 'Folder' : formatBytes(f.size || 0)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-[8px] hover:bg-slate-100 transition"><Download size={13} color="#8E9BAD" /></button>
                <button className="p-1.5 rounded-[8px] hover:bg-red-50 transition"><Trash2 size={13} color="#CBD5E1" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
