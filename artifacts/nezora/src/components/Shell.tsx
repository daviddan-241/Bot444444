import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Rocket, Box, Globe, Database, HardDrive,
  Bot, Zap, Activity, FileText, LayoutGrid, Settings, Server,
  Bell, Plus, GitBranch, Cpu, MoreHorizontal, Link2
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ]
  },
  {
    section: 'Deploy',
    items: [
      { label: 'Deploy Center', href: '/deploy', icon: Rocket },
      { label: 'My Hosted Sites', href: '/sites', icon: Link2 },
      { label: 'Live Apps', href: '/processes', icon: Activity },
      { label: 'Projects', href: '/projects', icon: Box },
      { label: 'Deployments', href: '/deployments', icon: GitBranch },
    ]
  },
  {
    section: 'Infrastructure',
    items: [
      { label: 'Containers', href: '/containers', icon: Cpu },
      { label: 'Domains', href: '/domains', icon: Globe },
      { label: 'Databases', href: '/databases', icon: Database },
      { label: 'Storage', href: '/storage', icon: HardDrive },
    ]
  },
  {
    section: 'Intelligence',
    items: [
      { label: 'AI Assistant', href: '/ai', icon: Bot },
      { label: 'Automation', href: '/automation', icon: Zap },
    ]
  },
  {
    section: 'Observe',
    items: [
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
      { label: 'Logs', href: '/logs', icon: FileText },
    ]
  },
  {
    section: 'Config',
    items: [
      { label: 'Templates', href: '/templates', icon: LayoutGrid },
      { label: 'Providers', href: '/providers', icon: Server },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  },
];

const BOTTOM_TABS = [
  { label: 'Home', href: '/', icon: LayoutDashboard },
  { label: 'Deploy', href: '/deploy', icon: Rocket },
  { label: 'Apps', href: '/projects', icon: Box },
  { label: 'AI', href: '/ai', icon: Bot },
  { label: 'More', href: '/monitoring', icon: MoreHorizontal },
];

function NavItem({ href, label, icon: Icon, pathname }: { href: string; label: string; icon: any; pathname: string }) {
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link href={href} className={`nav-item ${active ? 'active' : ''}`}>
      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

export function Shell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const [pathname] = useLocation();

  return (
    <div className="app-shell">
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt="logo"
              style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Danny's Cloud</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>OS v2</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 16px' }}>
          {NAV_SECTIONS.map((sec, i) => (
            <div key={i}>
              {sec.section && <div className="nav-section">{sec.section}</div>}
              {sec.items.map(item => (
                <NavItem key={item.href} {...item} pathname={pathname} />
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <Link href="/admin" className={`nav-item ${pathname === '/admin' ? 'active' : ''}`} style={{ margin: 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>D</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Danny</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Admin</div>
            </div>
          </Link>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="main-content">
        <header className="topbar">
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.01em' }}>
            {title ?? 'Danny\'s Cloud OS'}
          </div>
          {action}
          <button className="btn-icon btn btn-secondary" style={{ flexShrink: 0 }} onClick={() => window.location.href = '/deploy'}>
            <Plus size={18} strokeWidth={2} />
          </button>
          <button className="btn-icon btn btn-secondary" style={{ flexShrink: 0 }}>
            <Bell size={16} strokeWidth={1.8} />
          </button>
        </header>
        <main className="page-area">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="bottom-tabs">
        {BOTTOM_TABS.map(tab => {
          const active = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={`tab-item ${active ? 'active' : ''}`}>
              <Icon className="tab-icon" strokeWidth={active ? 2.2 : 1.6} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
