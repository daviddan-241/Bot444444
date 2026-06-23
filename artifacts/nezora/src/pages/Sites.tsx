import { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import {
  Globe, Trash2, ExternalLink, RefreshCw, Upload, Server,
  Copy, Check, Zap, Code2, Search, X, Loader2
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface Site {
  slug: string;
  name: string;
  url: string;
  framework: string;
  type: 'static' | 'live-app';
  source?: 'zip' | 'git';
  gitUrl?: string;
  branch?: string;
  createdAt: number;
  updatedAt?: number;
  size?: number;
  status?: string;
}

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const FRAMEWORK_ICONS: Record<string, string> = {
  'react-vite': '⚡', nextjs: '▲', 'node-express': '🟩', 'node-server': '🟩',
  python: '🐍', ruby: '💎', go: '🐹', static: '🌐', unknown: '📦',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn btn-secondary btn-sm" onClick={copy} title="Copy URL">
      {copied ? <Check size={12} color="#34C759" /> : <Copy size={12} />}
    </button>
  );
}

function StatusDot({ type, status }: { type: 'static' | 'live-app'; status?: string }) {
  if (type === 'static') return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#007AFF18', color: '#007AFF', fontWeight: 600 }}>STATIC</span>
  );
  const color = status === 'running' ? '#34C759' : status === 'crashed' ? '#FF3B30' : '#FF9500';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 6px', borderRadius: 10, background: `${color}18`, color, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {status?.toUpperCase() ?? 'LIVE'}
    </span>
  );
}

export default function Sites() {
  const base = BASE();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'static' | 'live-app'>('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${base}/api/real/sites`, { credentials: 'include' });
      const data = await r.json();
      if (data.ok) setSites(data.sites ?? []);
      else setError(data.message ?? 'Failed to load sites');
    } catch {
      setError('Network error — is the API server running?');
    }
    setLoading(false);
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const deleteSite = async (slug: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(slug);
    try {
      const r = await fetch(`${base}/api/real/sites/${slug}`, { method: 'DELETE', credentials: 'include' });
      if ((await r.json()).ok) setSites(s => s.filter(x => x.slug !== slug));
    } catch {}
    setDeleting(null);
  };

  const filtered = sites.filter(s => {
    if (filter !== 'all' && s.type !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.slug.includes(search.toLowerCase())) return false;
    return true;
  });

  const staticCount = sites.filter(s => s.type === 'static').length;
  const liveCount = sites.filter(s => s.type === 'live-app').length;

  return (
    <Shell title="My Hosted Sites">
      <div className="animate-rise" style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="section-title">My Hosted Sites</div>
            <div className="section-subtitle">All ZIP & Git deployments hosted on this server</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <a href="/deploy" className="btn btn-primary btn-sm">
              <Upload size={13} /> Deploy New
            </a>
          </div>
        </div>

        {/* Stats row */}
        {!loading && sites.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: sites.length, color: 'var(--text-primary)' },
              { label: 'Static Sites', value: staticCount, color: '#007AFF' },
              { label: 'Live Apps', value: liveCount, color: '#34C759' },
            ].map(stat => (
              <div key={stat.label} className="card" style={{ padding: '10px 18px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter */}
        {!loading && sites.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                className="field"
                placeholder="Search sites…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, paddingRight: search ? 30 : 12 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            {(['all', 'static', 'live-app'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="btn btn-sm"
                style={{ background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                {f === 'all' ? 'All' : f === 'static' ? '🌐 Static' : '🟢 Live Apps'}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 56, color: 'var(--text-tertiary)' }}>
            <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
            Loading your sites…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card card-inner" style={{ borderLeft: '3px solid #FF3B30', color: '#FF3B30', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sites.length === 0 && (
          <div className="card" style={{ padding: 56, textAlign: 'center' }}>
            <Server size={36} style={{ margin: '0 auto 14px', opacity: 0.25 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No hosted sites yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 22 }}>Upload a ZIP or deploy a Git repo from the Deploy Center</div>
            <a href="/deploy" className="btn btn-primary">
              <Upload size={14} /> Deploy your first site
            </a>
          </div>
        )}

        {/* No search results */}
        {!loading && sites.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            No sites match "{search}"
          </div>
        )}

        {/* Site list */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(site => (
              <div key={site.slug} className="card card-inner" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: site.type === 'live-app' ? '#34C75918' : '#007AFF18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {FRAMEWORK_ICONS[site.framework] ?? (site.type === 'live-app' ? '🟩' : '🌐')}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{site.name}</span>
                      <StatusDot type={site.type} status={site.status} />
                      {site.framework !== 'static' && site.framework !== 'unknown' && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                          {site.framework}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>deployed {timeAgo(site.createdAt)}</span>
                      {site.size ? <span>{fmtSize(site.size)}</span> : null}
                      {site.gitUrl && <span>📦 {site.gitUrl.replace('https://github.com/', '').slice(0, 30)}</span>}
                      {site.source && <span>via {site.source.toUpperCase()}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <CopyButton text={site.url} />
                    <a href={site.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                      <ExternalLink size={12} /> Open
                    </a>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: '#FF3B30' }}
                      onClick={() => deleteSite(site.slug, site.name)}
                      disabled={deleting === site.slug}
                    >
                      {deleting === site.slug ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>

                {/* URL bar */}
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: 8, padding: '6px 10px', gap: 8 }}>
                  <Globe size={11} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                  <code style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {site.url}
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
