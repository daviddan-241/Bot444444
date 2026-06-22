import { useState, createContext, useContext } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Rocket, Box, Globe, Database, HardDrive,
  Bot, Zap, Cpu, FileText, LayoutGrid, Settings, ChevronLeft,
  ChevronRight, Bell, Search, Menu, X, Activity, GitBranch,
  Shield, LogOut
} from 'lucide-react';

interface SidebarCtx { collapsed: boolean; setCollapsed: (v: boolean) => void; }
const SidebarContext = createContext<SidebarCtx>({ collapsed: false, setCollapsed: () => {} });
export const useSidebar = () => useContext(SidebarContext);

const NAV = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { section: 'Projects' },
  { label: 'Projects', href: '/projects', icon: Box },
  { label: 'Deployments', href: '/deployments', icon: Rocket },
  { label: 'Containers', href: '/containers', icon: Cpu },
  { label: 'Domains', href: '/domains', icon: Globe },
  { label: 'Databases', href: '/databases', icon: Database },
  { label: 'Storage', href: '/storage', icon: HardDrive },
  { section: 'AI' },
  { label: 'AI Assistant', href: '/ai', icon: Bot },
  { label: 'Automation', href: '/automation', icon: Zap },
  { section: 'Infrastructure' },
  { label: 'Monitoring', href: '/monitoring', icon: Activity },
  { label: 'Logs', href: '/logs', icon: FileText },
  { section: 'More' },
  { label: 'Templates', href: '/templates', icon: LayoutGrid },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function NavItem({ item, collapsed, pathname }: { item: any; collapsed: boolean; pathname: string }) {
  if (item.section) {
    if (collapsed) return <div className="my-1 h-px mx-2" style={{ background: '#E2E8F2' }} />;
    return (
      <div className="px-3 pt-4 pb-1">
        <span className="text-[10px] font-700 tracking-widest uppercase" style={{ color: '#8E9BAD' }}>{item.section}</span>
      </div>
    );
  }
  const Icon = item.icon;
  const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 mx-2 px-2.5 py-2.5 rounded-[13px] transition-all duration-150 cursor-pointer select-none ${
        active
          ? 'text-white font-600'
          : 'hover:bg-slate-100 font-500'
      }`}
      style={active ? { background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 12px rgba(10,132,255,0.30)' } : { color: '#3D4D63' }}
    >
      <Icon size={17} style={{ flexShrink: 0 }} />
      {!collapsed && <span className="text-[13.5px] whitespace-nowrap overflow-hidden" style={{ letterSpacing: '-0.01em' }}>{item.label}</span>}
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pathname] = useLocation();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className="flex-shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
          <GitBranch size={16} color="white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-800 text-[14px] leading-tight" style={{ color: '#0A0F1E', letterSpacing: '-0.02em' }}>Danny's Cloud</div>
            <div className="text-[10px] font-500" style={{ color: '#8E9BAD' }}>OS v2</div>
          </div>
        )}
      </div>

      {/* Deploy button */}
      <div className={`px-3 mb-2 ${collapsed ? 'px-2' : ''}`}>
        <Link href="/deploy" className={`flex items-center gap-2.5 w-full rounded-[14px] py-2.5 text-white font-700 text-[13px] transition-all active:scale-[0.98] ${collapsed ? 'justify-center px-2' : 'px-3'}`}
          style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', boxShadow: '0 4px 14px rgba(10,132,255,0.35)' }}>
          <Rocket size={15} style={{ flexShrink: 0 }} />
          {!collapsed && 'New Deployment'}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-1">
        {NAV.map((item, i) => (
          <NavItem key={i} item={item} collapsed={collapsed} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t pb-2 pt-2" style={{ borderColor: '#E2E8F2' }}>
        <Link href="/settings" className={`flex items-center gap-3 mx-2 px-2.5 py-2 rounded-[13px] hover:bg-slate-100 transition ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-700 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>D</div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-[12.5px] font-600 truncate" style={{ color: '#0A0F1E' }}>Admin</div>
              <div className="text-[10.5px]" style={{ color: '#8E9BAD' }}>Owner</div>
            </div>
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex min-h-dvh" style={{ background: '#F5F8FC' }}>
        {/* Desktop sidebar */}
        <aside
          className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-30 bg-white border-r overflow-hidden transition-all duration-220"
          style={{ width: collapsed ? 64 : 240, borderColor: '#E2E8F2', boxShadow: '2px 0 16px rgba(10,15,30,0.04)' }}
        >
          {sidebarContent}
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-5 -right-3 w-6 h-6 rounded-full border bg-white flex items-center justify-center shadow-sm z-10 hover:bg-slate-50 transition"
            style={{ borderColor: '#E2E8F2' }}
          >
            {collapsed ? <ChevronRight size={12} color="#5E6E85" /> : <ChevronLeft size={12} color="#5E6E85" />}
          </button>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="relative z-50 w-64 bg-white h-full shadow-2xl">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main content */}
        <div
          className="flex-1 flex flex-col min-h-dvh transition-all duration-220"
          style={{ marginLeft: collapsed ? 64 : 240, '--sidebar-offset': collapsed ? '64px' : '240px' } as any}
        >
          {/* Top bar */}
          <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b flex items-center gap-3 px-4 py-3" style={{ borderColor: '#E2E8F2' }}>
            <button className="lg:hidden flex-shrink-0 p-1.5 rounded-xl hover:bg-slate-100 transition" onClick={() => setMobileOpen(true)}>
              <Menu size={18} color="#3D4D63" />
            </button>
            <div className="flex-1 flex items-center gap-2.5 max-w-md rounded-[13px] px-3 h-9 border" style={{ background: '#F5F8FC', borderColor: '#E2E8F2' }}>
              <Search size={14} color="#8E9BAD" />
              <input className="flex-1 bg-transparent border-none outline-none text-[13px]" style={{ color: '#0A0F1E' }} placeholder="Search projects, deployments, logs…" />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button className="relative p-2 rounded-xl hover:bg-slate-100 transition">
                <Bell size={17} color="#3D4D63" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 border-2 border-white" />
              </button>
              <Link href="/settings" className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-700" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>D</Link>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
