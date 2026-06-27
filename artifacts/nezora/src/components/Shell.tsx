import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Rocket, Box, Globe, Database, HardDrive,
  Zap, Activity, FileText, LayoutGrid, Settings, Server,
  Bell, Plus, GitBranch, Cpu, Link2, Wrench, Bot
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
    section: 'Observe',
    items: [
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
      { label: 'Logs', href: '/logs', icon: FileText },
      { label: 'Automation', href: '/automation', icon: Zap },
    ]
  },
  {
    section: 'Config',
    items: [
      { label: 'Templates', href: '/templates', icon: LayoutGrid },
      { label: 'Providers', href: '/providers', icon: Server },
      { label: 'AI Engine', href: '/ai', icon: Bot },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  },
];

const BOTTOM_TABS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Deploy', href: '/deploy', icon: Rocket },
  { label: 'Apps', href: '/processes', icon: Activity },
  { label: 'Projects', href: '/projects', icon: Box },
  { label: 'Settings', href: '/settings', icon: Settings },
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

function NezoraMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nzGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0A1628" />
          <stop offset="50%" stopColor="#1246C8" />
          <stop offset="100%" stopColor="#3D8EFF" />
        </linearGradient>
        <linearGradient id="nzShine" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="url(#nzGrad)" />
      <rect width="64" height="64" rx="17" fill="url(#nzShine)" />
      {/* Cloud body */}
      <path
        d="M44 38a7 7 0 00-6.13-6.94A10 10 0 0019 36a7 7 0 000 14h25a7 7 0 000-12z"
        fill="white"
        opacity="0.95"
      />
      {/* Upload arrow */}
      <line x1="32" y1="32" x2="32" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <polyline points="27.5,25.5 32,21 36.5,25.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Accent dot */}
      <circle cx="49" cy="15" r="4.5" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

function UserAvatar({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="avatarGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1246C8" />
          <stop offset="100%" stopColor="#3D8EFF" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="14" fill="url(#avatarGrad)" />
      <circle cx="28" cy="22" r="9" fill="rgba(255,255,255,0.9)" />
      <path d="M10 50c0-9.94 8.06-18 18-18s18 8.06 18 18" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

export function Shell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const [pathname] = useLocation();

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <NezoraMark size={38} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '.01em' }}>Nezora</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, letterSpacing: '.02em' }}>Deploy Center</div>
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
            <UserAvatar size={28} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Danny</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Admin</div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="md:hidden">
            <NezoraMark size={30} />
          </div>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.01em' }}>
            {title ?? 'Nezora Deploy Center'}
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

      {/* Mobile Bottom Tab Bar */}
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
