import { Shell } from '@/components/Shell';
import { Zap, Plus, Play, Pause, Trash2, Clock, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const AUTOMATION_TYPES = [
  { id: 'deploy', name: 'Auto Deploy', desc: 'Deploy on every git push', icon: '🚀' },
  { id: 'backup', name: 'Scheduled Backup', desc: 'Backup databases daily', icon: '💾' },
  { id: 'restart', name: 'Auto Restart', desc: 'Restart on health check fail', icon: '🔄' },
  { id: 'notify', name: 'Notifications', desc: 'Alert on deploy events', icon: '🔔' },
  { id: 'scale', name: 'Auto Scale', desc: 'Scale based on traffic', icon: '📈' },
  { id: 'cleanup', name: 'Cleanup Jobs', desc: 'Remove old deployments', icon: '🧹' },
];

export default function Automation() {
  const [automations, setAutomations] = useState<any[]>([]);

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-5xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Automation</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Create workflows to automate your infrastructure</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
            <Plus size={14} /> New Automation
          </button>
        </div>

        {/* Automation types */}
        <div className="mb-6">
          <h2 className="text-[11px] font-700 uppercase tracking-widest mb-3" style={{ color: '#8E9BAD' }}>Automation Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AUTOMATION_TYPES.map(a => (
              <div key={a.id} className="card card-hover p-4 cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <div className="text-[13.5px] font-700" style={{ color: '#0A0F1E' }}>{a.name}</div>
                    <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{a.desc}</div>
                  </div>
                </div>
                <button className="w-full mt-2 py-2 rounded-[10px] text-[12.5px] font-600 flex items-center justify-center gap-1.5" style={{ background: '#F0F3F8', color: '#5E6E85' }}>
                  <Plus size={12} /> Add <ChevronRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Active automations */}
        <div>
          <h2 className="text-[11px] font-700 uppercase tracking-widest mb-3" style={{ color: '#8E9BAD' }}>Active Automations</h2>
          <div className="card overflow-hidden">
            {automations.length === 0 ? (
              <div className="p-10 text-center">
                <Zap size={28} color="#CBD5E1" className="mx-auto mb-2" />
                <div className="text-[13px]" style={{ color: '#8E9BAD' }}>No automations configured yet</div>
              </div>
            ) : automations.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-4 px-5 py-4 ${i < automations.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
                <div className="flex-1">
                  <div className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>{a.name}</div>
                  <div className="flex items-center gap-1 text-[11.5px] mt-0.5" style={{ color: '#8E9BAD' }}>
                    <Clock size={11} /> {a.schedule}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 rounded-[8px] hover:bg-green-50 transition"><Play size={13} color="#30D158" /></button>
                  <button className="p-1.5 rounded-[8px] hover:bg-slate-100 transition"><Pause size={13} color="#8E9BAD" /></button>
                  <button className="p-1.5 rounded-[8px] hover:bg-red-50 transition"><Trash2 size={13} color="#FF453A" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
