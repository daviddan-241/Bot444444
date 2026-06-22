import { Shell } from '@/components/Shell';
import { Database, Plus, CheckCircle2, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

const DB_TYPES = ['PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'MariaDB'];

export default function Databases() {
  const [dbs, setDbs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('PostgreSQL');
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/databases`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setDbs(d.databases || []); }
    } catch {}
    setLoading(false);
  }

  async function create() {
    if (!newName.trim()) return;
    try {
      await fetch(`${BASE}/api/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, type: newType }),
        credentials: 'include',
      });
      setShowNew(false); setNewName('');
      load();
    } catch {}
  }

  useEffect(() => { load(); }, []);

  const typeIcon: Record<string, string> = { PostgreSQL: '🐘', MySQL: '🐬', Redis: '🔴', SQLite: '💎', MariaDB: '🔷' };

  return (
    <Shell>
      <div className="p-4 lg:p-7 max-w-4xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-800 tracking-tight mb-0.5" style={{ letterSpacing: '-0.03em', color: '#0A0F1E' }}>Databases</h1>
            <p className="text-[13px]" style={{ color: '#5E6E85' }}>Provision and manage database instances</p>
          </div>
          <button onClick={() => setShowNew(v => !v)} className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
            <Plus size={14} /> New Database
          </button>
        </div>

        {showNew && (
          <div className="card p-5 mb-5 animate-rise">
            <div className="text-[13px] font-700 mb-4" style={{ color: '#0A0F1E' }}>Create Database</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Name</label>
                <input className="field" placeholder="my-database" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <label className="text-[12px] font-600 block mb-1.5" style={{ color: '#5E6E85' }}>Type</label>
                <select className="field" value={newType} onChange={e => setNewType(e.target.value)}>
                  {DB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={create} className="px-5 py-2.5 rounded-[13px] text-[13px] font-700 text-white" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>Create</button>
              <button onClick={() => setShowNew(false)} className="px-5 py-2.5 rounded-[13px] text-[13px] font-600" style={{ background: '#F0F3F8', color: '#5E6E85' }}>Cancel</button>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center"><RefreshCw size={20} color="#CBD5E1" className="animate-spin mx-auto mb-2" /></div>
          ) : dbs.length === 0 ? (
            <div className="p-12 text-center">
              <Database size={32} color="#CBD5E1" className="mx-auto mb-3" />
              <div className="text-[14px] font-600 mb-1" style={{ color: '#0A0F1E' }}>No databases yet</div>
              <div className="text-[13px]" style={{ color: '#8E9BAD' }}>Create a database to store your application data</div>
            </div>
          ) : dbs.map((db, i) => (
            <div key={db.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 ${i < dbs.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#E2E8F2' }}>
              <span className="text-xl">{typeIcon[db.type] || '🗃️'}</span>
              <div className="flex-1">
                <div className="text-[13px] font-700" style={{ color: '#0A0F1E' }}>{db.name}</div>
                <div className="text-[12px]" style={{ color: '#8E9BAD' }}>{db.type} · {db.size || 'Unknown size'}</div>
              </div>
              <CheckCircle2 size={15} color="#30D158" />
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-[8px] hover:bg-red-50 transition"><Trash2 size={13} color="#CBD5E1" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
