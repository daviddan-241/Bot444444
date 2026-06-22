import { Shell } from '@/components/Shell';
import { Zap, Plus, Play, Pause, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

const PRESETS = [
  { id: 'auto-restart', name: 'Auto Restart on Crash', description: 'Automatically restart any app that crashes', trigger: 'on_crash', action: 'restart', enabled: true },
  { id: 'health-check', name: 'Health Check Every 30s', description: 'Ping all running apps and report failures', trigger: 'interval_30s', action: 'health_check', enabled: true },
  { id: 'keep-alive', name: 'Keep Alive Ping', description: 'Self-ping every 4 min to prevent Render sleep', trigger: 'interval_4m', action: 'self_ping', enabled: true },
  { id: 'crash-guard', name: 'Crash Guard', description: 'Stop apps that restart > 5 times to prevent loops', trigger: 'on_restart_limit', action: 'stop_loop', enabled: true },
  { id: 'log-rotate', name: 'Log Rotation', description: 'Trim log files to 500 lines every 5 minutes', trigger: 'interval_5m', action: 'trim_logs', enabled: true },
  { id: 'memory-alert', name: 'Memory Alert at 90%', description: 'Alert when system RAM exceeds 90%', trigger: 'ram_gt_90', action: 'alert', enabled: true },
];

export default function Automation() {
  const [workflows, setWorkflows] = useState(PRESETS);

  const toggle = (id: string) => setWorkflows(w => w.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));

  return (
    <Shell title="Automation">
      <div className="animate-rise" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">Automation</div>
            <div className="section-subtitle">Built-in workers that keep your platform running 24/7</div>
          </div>
        </div>

        {/* Status banner */}
        <div className="card card-inner" style={{ marginBottom: 20, background: 'linear-gradient(135deg, #EBF5FF, #EDE9FE)', border: '1px solid #BFDBFE' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{workflows.filter(w => w.enabled).length} automation rules active</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Workers run automatically in the background — no setup needed</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#34C759', fontWeight: 600 }}>
              <span className="stat-dot dot-green dot-pulse" /> All systems running
            </div>
          </div>
        </div>

        {/* Workflow list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workflows.map(w => (
            <div key={w.id} className="card card-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: w.enabled ? '#EBF5FF' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .2s' }}>
                {w.trigger.startsWith('interval') ? <Clock size={18} color={w.enabled ? '#007AFF' : '#C6C6C8'} />
                  : w.trigger.startsWith('on_') ? <Zap size={18} color={w.enabled ? '#007AFF' : '#C6C6C8'} />
                  : <CheckCircle2 size={18} color={w.enabled ? '#007AFF' : '#C6C6C8'} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{w.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{w.description}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span className="pill pill-blue" style={{ fontSize: 11 }}>Trigger: {w.trigger}</span>
                  <span className="pill pill-purple" style={{ fontSize: 11 }}>Action: {w.action}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className={`btn btn-sm ${w.enabled ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggle(w.id)}>
                  {w.enabled ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Enable</>}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card card-inner" style={{ marginTop: 20, background: 'var(--bg)', border: '1.5px dashed var(--separator)', textAlign: 'center', cursor: 'default', opacity: .6 }}>
          <Plus size={20} style={{ margin: '0 auto 8px', opacity: .4 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Custom Workflows</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Coming soon — build your own trigger + action rules</div>
        </div>
      </div>
    </Shell>
  );
}
