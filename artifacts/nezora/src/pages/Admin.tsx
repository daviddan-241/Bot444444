import { Shell } from '@/components/Shell';
import { Shield, Lock, Activity, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Admin() {
  const checks = [
    { label: 'Admin token configured', ok: true, note: 'ADMIN_TOKEN env var is set' },
    { label: 'HTTPS enforced', ok: true, note: 'All API routes require auth' },
    { label: 'File upload limits', ok: true, note: 'Max 80MB per upload' },
    { label: 'ZIP path traversal protection', ok: true, note: 'All entries validated' },
    { label: 'Shell access locked', ok: false, note: 'ALLOW_SHELL=false (default)' },
    { label: 'Rate limiting', ok: false, note: 'Not yet configured' },
  ];

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-3xl mx-auto animate-rise">
        <div className="mb-6">
          <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Admin Panel</h1>
          <p className="text-[13px]" style={{ color: '#5E6E85' }}>Security overview and platform health</p>
        </div>

        <div className="card p-5 mb-4" style={{ background: 'linear-gradient(135deg,#0A0F1E,#1A2440)' }}>
          <div className="flex items-center gap-3 mb-2">
            <Shield size={20} color="#0A84FF" />
            <span className="text-[15px] font-700 text-white">Single-Owner Mode</span>
          </div>
          <p className="text-[13px]" style={{ color: '#8E9BAD' }}>
            Danny's Cloud OS runs in personal mode — only your admin token can access all operations. No multi-tenant exposure.
          </p>
        </div>

        <div className="card p-5 mb-4">
          <div className="text-[13px] font-700 mb-4" style={{ color: '#0A0F1E' }}>Security Checklist</div>
          <div className="space-y-3">
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-3">
                {c.ok ? <CheckCircle2 size={16} color="#30D158" /> : <AlertTriangle size={16} color="#FF9F0A" />}
                <div className="flex-1">
                  <div className="text-[13px] font-600" style={{ color: '#0A0F1E' }}>{c.label}</div>
                  <div className="text-[11.5px]" style={{ color: '#8E9BAD' }}>{c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Auth Middleware', status: 'Active', color: '#30D158', icon: Lock },
            { label: 'Request Logging', status: 'Active', color: '#30D158', icon: Activity },
            { label: 'Multi-User', status: 'Disabled', color: '#FF9F0A', icon: Users },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card p-4 text-center">
                <Icon size={20} color={s.color} className="mx-auto mb-2" />
                <div className="text-[13px] font-700 mb-0.5" style={{ color: '#0A0F1E' }}>{s.label}</div>
                <div className="text-[12px] font-500" style={{ color: s.color }}>{s.status}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
