import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import {
  Bot, Zap, CheckCircle2, AlertCircle, RefreshCw, Activity,
  Cpu, Server, Shield
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface AIStatus {
  model: string;
  available: boolean;
  providers?: string[];
}

interface RepairStat {
  total: number;
  fixed: number;
  pending: number;
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={`stat-dot ${ok ? 'dot-green dot-pulse' : 'dot-gray'}`} />
        <span style={{ fontSize: 13, color: ok ? '#34C759' : 'var(--text-tertiary)', fontWeight: 600 }}>{value}</span>
      </div>
    </div>
  );
}

function ProviderCard({ name, active }: { name: string; active: boolean }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      border: `1.5px solid ${active ? 'rgba(52,199,89,0.35)' : 'var(--border)'}`,
      background: active ? 'rgba(52,199,89,0.06)' : 'var(--bg)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span className={`stat-dot ${active ? 'dot-green' : 'dot-gray'}`} />
      <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{name}</span>
      {active && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#34C759', fontWeight: 600 }}>ACTIVE</span>}
    </div>
  );
}

export default function AI() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [repair, setRepair] = useState<RepairStat>({ total: 0, fixed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const base = BASE();

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const r = await fetch(`${base}/api/ai/status`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setStatus({ model: d.model ?? 'built-in', available: !!d.model && d.model !== 'built-in', providers: d.providers ?? [] });
      }
    } catch { setStatus({ model: 'unavailable', available: false }); }

    // Load auto-repair stats from process logs if available
    try {
      const pr = await fetch(`${base}/api/processes`, { credentials: 'include' });
      if (pr.ok) {
        const d = await pr.json();
        const procs = d.processes ?? [];
        const crashed = procs.filter((p: any) => p.status === 'crashed').length;
        const running = procs.filter((p: any) => p.status === 'running').length;
        setRepair({ total: procs.length, fixed: running, pending: crashed });
      }
    } catch {}

    setLoading(false);
    if (manual) setRefreshing(false);
  };

  useEffect(() => { load(); const t = setInterval(() => load(), 15000); return () => clearInterval(t); }, []);

  function modelLabel(model: string): string {
    if (!model || model === 'Detecting') return 'Detecting model...';
    if (model.startsWith('openrouter:')) return `OpenRouter / ${model.split(':').slice(1).join(':').split('/').pop()} / Free`;
    if (model.startsWith('groq:')) return 'Groq / Llama 3.3 / Free';
    if (model.startsWith('together:')) return 'Together.ai / Mixtral / Free';
    if (model.startsWith('ollama:')) return `Ollama / ${model.split(':').slice(1).join(':') || 'llama3.2'} / Local`;
    if (model === 'huggingface') return 'HuggingFace / Free';
    if (model === 'built-in') return 'No external AI configured';
    return model;
  }

  const PROVIDERS = [
    { name: 'OpenRouter', key: 'openrouter' },
    { name: 'Groq', key: 'groq' },
    { name: 'Together.ai', key: 'together' },
    { name: 'Ollama (Local)', key: 'ollama' },
    { name: 'HuggingFace', key: 'huggingface' },
  ];

  const activeKey = status?.model?.split(':')?.[0] ?? '';

  return (
    <Shell title="AI Engine">
      <div className="animate-rise" style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">AI Engine</div>
            <div className="section-subtitle">Background intelligence — auto-repair, stack detection, and diagnostics</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Main status card */}
        <div className="card card-inner" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #5856D6, #007AFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>AI Status</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                {loading ? (
                  <><RefreshCw size={11} className="spin" /> Loading...</>
                ) : status?.available ? (
                  <><span className="stat-dot dot-green dot-pulse" /> Online</>
                ) : (
                  <><span className="stat-dot dot-gray" /> Offline — using built-in</>
                )}
              </div>
            </div>
          </div>

          <StatusRow
            label="Active Model"
            value={status ? modelLabel(status.model) : '—'}
            ok={!!status?.available}
          />
          <StatusRow
            label="Auto-Repair Engine"
            value={status?.available ? 'Enabled' : 'Disabled (no model)'}
            ok={!!status?.available}
          />
          <StatusRow
            label="Stack Detection"
            value="Always active"
            ok={true}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Diagnostics Engine</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="stat-dot dot-green dot-pulse" />
              <span style={{ fontSize: 13, color: '#34C759', fontWeight: 600 }}>Always active</span>
            </div>
          </div>
        </div>

        {/* App health */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="card card-inner" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{repair.total}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Apps</div>
          </div>
          <div className="card card-inner" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#34C759' }}>{repair.fixed}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Running</div>
          </div>
          <div className="card card-inner" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: repair.pending > 0 ? '#FF3B30' : 'var(--text-tertiary)' }}>{repair.pending}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Crashed</div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="card card-inner" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>Engine Capabilities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Zap, label: 'Automatic stack detection', sub: 'Detects Node.js, Python, Go, Ruby, Discord bots and more', active: true },
              { icon: Activity, label: 'Crash auto-restart', sub: 'Monitors all processes — restarts on exit with back-off', active: true },
              { icon: Shield, label: 'Dependency sanitization', sub: 'Rewrites workspace: protocol deps for standalone npm install', active: true },
              { icon: Cpu, label: 'AI-powered diagnostics', sub: 'Analyzes build errors and suggests fixes', active: !!status?.available },
              { icon: Server, label: 'Repo analysis', sub: 'Clones a repo and generates deployment instructions', active: !!status?.available },
            ].map(({ icon: Icon, label, sub, active }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: active ? 'rgba(52,199,89,0.12)' : 'var(--bg)', border: `1px solid ${active ? 'rgba(52,199,89,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon size={14} color={active ? '#34C759' : 'var(--text-tertiary)'} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sub}</div>
                </div>
                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {active
                    ? <CheckCircle2 size={15} color="#34C759" />
                    : <AlertCircle size={15} color="var(--text-tertiary)" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Provider availability */}
        <div className="card card-inner" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>AI Providers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROVIDERS.map(p => (
              <ProviderCard key={p.key} name={p.name} active={activeKey === p.key} />
            ))}
          </div>
          {!status?.available && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,149,0,0.08)', borderRadius: 9, border: '1px solid rgba(255,149,0,0.25)', fontSize: 12, color: '#FF9500', lineHeight: 1.6 }}>
              No AI provider is active. Set OPENROUTER_API_KEY, GROQ_API_KEY, or TOGETHER_API_KEY in your environment to enable AI-powered features.
            </div>
          )}
        </div>

      </div>
    </Shell>
  );
}
