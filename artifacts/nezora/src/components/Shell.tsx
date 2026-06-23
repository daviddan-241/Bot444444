import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Rocket, Box, Globe, Database, HardDrive,
  Bot, Zap, Activity, FileText, LayoutGrid, Settings, Server,
  Bell, Plus, GitBranch, Cpu, MoreHorizontal, Link2, Code2, Wrench
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
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Builder', href: '/deploy', icon: Wrench },
  { label: 'Code', href: '/ai', icon: Code2, accent: true },
  { label: 'Deploy', href: '/processes', icon: Rocket },
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

// Cloud logo SVG
function CloudLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cloudGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F2460" />
          <stop offset="50%" stopColor="#1E5FD4" />
          <stop offset="100%" stopColor="#4A9BFF" />
        </linearGradient>
        <linearGradient id="cloudShine" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cloudGrad)" />
      <rect width="64" height="64" rx="16" fill="url(#cloudShine)" />
      {/* Cloud shape */}
      <path
        d="M46 37a8 8 0 00-7-7.93A11 11 0 0017 34a8 8 0 000 16h29a8 8 0 000-13z"
        fill="white"
        opacity="0.96"
      />
      {/* Upload arrow */}
      <path d="M32 30v-10M28.5 23l3.5-3.5 3.5 3.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {/* Shine dot */}
      <circle cx="50" cy="14" r="4" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

// User avatar — real styled avatar instead of plain "D"
function UserAvatar({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="avatarGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E5FD4" />
          <stop offset="100%" stopColor="#4A9BFF" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="14" fill="url(#avatarGrad)" />
      {/* Head */}
      <circle cx="28" cy="22" r="9" fill="rgba(255,255,255,0.9)" />
      {/* Body */}
      <path d="M10 50c0-9.94 8.06-18 18-18s18 8.06 18 18" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

export function Shell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const [pathname] = useLocation();

  return (
    <div className="app-shell">
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <CloudLogo size={38} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '.01em' }}>DANNY'S</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, letterSpacing: '.02em' }}>Cloud</div>
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

      {/* ── Main Area ── */}
      <div className="main-content">
        <header className="topbar">
          {/* Mobile: show logo in topbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="md:hidden">
            <CloudLogo size={30} />
          </div>
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
          if (tab.accent) {
            return (
              <Link key={tab.href} href={tab.href} className="tab-item" style={{ gap: 2 }}>
                <div className="tab-item-active-dot" style={active ? {} : { background: 'rgba(74,155,255,0.18)', boxShadow: 'none' }}>
                  <Icon size={18} color={active ? '#fff' : 'var(--blue)'} strokeWidth={2} />
                </div>
                <span style={{ color: active ? 'var(--blue)' : 'var(--text-tertiary)' }}>{tab.label}</span>
              </Link>
            );
          }
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
