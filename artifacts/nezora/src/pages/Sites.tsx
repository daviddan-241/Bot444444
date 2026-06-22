import { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import { Globe, Trash2, ExternalLink, RefreshCw, Upload, Server } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface Site {
  slug: string;
  url: string;
  createdAt: number;
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

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const base = BASE();

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

  const deleteSite = async (slug: string) => {
    if (!confirm(`Delete site "${slug}"? This cannot be undone.`)) return;
    setDeleting(slug);
    try {
      await fetch(`${base}/api/real/sites/${slug}`, { method: 'DELETE', credentials: 'include' });
      setSites(s => s.filter(x => x.slug !== slug));
    } catch { /* ignore */ }
    setDeleting(null);
  };

  return (
    <Shell title="Hosted Sites">
      <div className="animate-rise" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="section-title">My Hosted Sites</div>
            <div className="section-subtitle">All ZIP & Git deployments hosted on this server</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.href = '/deploy'}>
              <Upload size={13} /> Deploy New
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
            Loading sites…
          </div>
        )}

        {!loading && error && (
          <div className="card card-inner" style={{ borderLeft: '3px solid #FF3B30', color: '#FF3B30' }}>
            {error}
          </div>
        )}

        {!loading && !error && sites.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <Server size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No hosted sites yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>Upload a ZIP or deploy a Git repo to get started</div>
            <button className="btn btn-primary" onClick={() => window.location.href = '/deploy'}>
              <Upload size={14} /> Deploy your first site
            </button>
          </div>
        )}

        {!loading && sites.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...sites].sort((a, b) => b.createdAt - a.createdAt).map(site => (
              <div key={site.slug} className="card card-inner" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FF3C0018', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Globe size={16} color="#FF3C00" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{site.slug}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {site.url} · deployed {timeAgo(site.createdAt)}
                  </div>
                </div>
                <a href={site.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                  <ExternalLink size={13} /> Open
                </a>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flexShrink: 0, color: '#FF3B30' }}
                  onClick={() => deleteSite(site.slug)}
                  disabled={deleting === site.slug}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
