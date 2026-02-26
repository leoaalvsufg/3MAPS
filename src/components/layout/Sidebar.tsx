import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, Map, ChevronLeft, ChevronRight, X, Tag, LogOut, LogIn, User, Crown, Shield, Clock, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUsageStore } from '@/stores/usage-store';
import { useMapsStore } from '@/stores/maps-store';
import { TEMPLATES } from '@/lib/constants';
import { APP_VERSION, RELEASE_ID } from '@/lib/version';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  exact: boolean;
  iconColor: string;      // text color for the icon
  iconBg: string;         // background color for the icon container
  iconBgActive: string;   // background when nav item is active
}

const BASE_NAV_ITEMS: NavItem[] = [
  {
    to: '/', icon: Plus, label: 'Novo Mapa', exact: true,
    iconColor: 'text-blue-600', iconBg: 'bg-blue-50', iconBgActive: 'bg-blue-100',
  },
  {
    to: '/maps', icon: Map, label: 'Meus Mapas', exact: false,
    iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', iconBgActive: 'bg-emerald-100',
  },
  {
    to: '/tags', icon: Tag, label: 'Tags', exact: false,
    iconColor: 'text-violet-600', iconBg: 'bg-violet-50', iconBgActive: 'bg-violet-100',
  },
];


/** 3Maps icon — uses the favicon.svg from public */
function LogoImage({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/favicon.svg"
      alt="3Maps"
      width={size}
      height={size}
      className="shrink-0 object-contain"
      draggable={false}
    />
  );
}

function SidebarContent({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const planLimits = useUsageStore((s) => s.limits);
  const planId = planLimits?.id ?? 'free';
  const isPremium = planId === 'premium';
  const isEnterprise = planId === 'enterprise';
  const isAdmin = (user as (typeof user & { isAdmin?: boolean }) | null)?.isAdmin === true;
  // Use a stable selector — only re-renders when maps array reference changes
  const maps = useMapsStore((s) => s.maps);
  const recentMaps = maps
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const NAV_ITEMS = BASE_NAV_ITEMS;

  function handleLogout() {
    logout();
    onClose?.();
    navigate('/');
  }

  return (
    <div className={cn(
      'flex flex-col h-full bg-white border-r border-slate-200/80 transition-all duration-300',
      collapsed ? 'w-[68px]' : 'w-[250px]'
    )}>
      {/* Logo area */}
      <div className={cn(
        'flex items-center px-4 border-b border-slate-100',
        collapsed ? 'justify-center h-16' : 'gap-3 h-16'
      )}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
		  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm shadow-slate-200 ring-1 ring-slate-200/60">
			  <LogoImage size={34} />
		  </div>
          {!collapsed && (
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              3Maps
            </span>
          )}
        </button>
        {onClose && (
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav role="navigation" aria-label="Menu principal" className={cn('flex-1 overflow-y-auto px-3 py-4', collapsed ? 'px-2' : 'px-3')}>
        <div className="space-y-1.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label, exact, iconColor, iconBg, iconBgActive }) => (
            <Tooltip key={to} delayDuration={0}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  end={exact}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                      collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
                      isActive
                        ? 'bg-slate-50 text-slate-900 shadow-sm shadow-slate-100'
                        : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700',
                    )
                  }
                  aria-current={
                    (exact ? location.pathname === to : location.pathname.startsWith(to))
                      ? 'page'
                      : undefined
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className={cn(
                        'flex items-center justify-center rounded-lg shrink-0 transition-all duration-200',
                        collapsed ? 'w-9 h-9' : 'w-8 h-8',
                        isActive ? iconBgActive : iconBg,
                        !isActive && 'group-hover:scale-105',
                      )}>
                        <Icon className={cn('shrink-0 transition-colors', iconColor, collapsed ? 'h-4.5 w-4.5' : 'h-4 w-4')} />
                      </div>
                      {!collapsed && (
                        <span className="truncate">{label}</span>
                      )}
                    </>
                  )}
                </NavLink>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" sideOffset={8}>
                  <p className="font-medium">{label}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </div>

        {/* Recent maps */}
        {recentMaps.length > 0 && (
          <div className={cn('mt-4', collapsed ? 'hidden' : '')}>
            <div className="flex items-center gap-1.5 px-3 mb-1.5">
              <Clock className="h-3 w-3 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Recentes</span>
            </div>
            <div className="space-y-0.5">
              {recentMaps.map((map) => {
                const template = TEMPLATES.find((t) => t.id === map.template);
                const isActive = location.pathname === `/map/${map.id}`;
                return (
                  <button
                    key={map.id}
                    onClick={() => { navigate(`/map/${map.id}`); onClose?.(); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-all duration-200',
                      isActive
                        ? 'bg-slate-50 text-slate-900'
                        : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700'
                    )}
                    title={map.ownerPath ?? map.title}
                  >
                    <span className="text-sm shrink-0">{template?.icon ?? '🗺️'}</span>
                    <span className="text-xs truncate flex-1">{map.ownerPath ?? map.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer — user info + auth actions */}
      <div className={cn('border-t border-slate-100', collapsed ? 'px-2 py-3' : 'px-4 py-3')}>
        {isAuthenticated && user ? (
          <>
            {/* Admin panel link */}
            {isAdmin && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/admin"
                    onClick={onClose}
                    className={cn(
                      'flex items-center rounded-lg text-sm font-medium transition-all duration-200 mb-1',
                      collapsed ? 'justify-center p-2.5' : 'gap-2 px-2 py-2',
                      location.pathname === '/admin'
                        ? 'bg-violet-50 text-violet-700'
                        : 'text-violet-600 hover:bg-violet-50 hover:text-violet-700'
                    )}
                  >
                    <div className={cn(
                      'flex items-center justify-center rounded-lg bg-violet-50 shrink-0',
                      collapsed ? 'w-9 h-9' : 'w-8 h-8'
                    )}>
                      <Shield className="h-4 w-4 text-violet-600" />
                    </div>
                    {!collapsed && <span className="truncate text-xs font-semibold">Painel Admin</span>}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" sideOffset={8}>
                    <p className="font-medium">Painel Admin</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            {!collapsed && (
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <NavLink
                  to="/profile"
                  onClick={onClose}
                  className="flex items-center gap-2 min-w-0 flex-1 rounded-lg hover:bg-slate-50 transition-colors -m-1 p-1"
                >
                  {user.avatarUrl && user.avatarUrl.startsWith('http') ? (
                    <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 shrink-0">
                      <User className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-600 truncate flex-1 min-w-0">{user.username}</span>
                  {isAdmin ? (
                    <Badge className="text-[10px] px-1.5 py-0 bg-violet-600 hover:bg-violet-600 text-white gap-0.5 shrink-0">
                      <Shield className="h-2.5 w-2.5" />
                      Admin
                    </Badge>
                  ) : isEnterprise ? (
                    <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 hover:bg-blue-600 text-white gap-0.5 shrink-0">
                      <Crown className="h-2.5 w-2.5" />
                      Enterprise
                    </Badge>
                  ) : isPremium ? (
                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white gap-0.5 shrink-0">
                      <Crown className="h-2.5 w-2.5" />
                      Pro
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      Free
                    </Badge>
                  )}
                </NavLink>
              </div>
            )}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={collapsed ? 'icon' : 'sm'}
                  className={cn(
                    'text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors',
                    collapsed ? 'w-full justify-center h-9' : 'w-full justify-start gap-2 h-8 px-2'
                  )}
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="text-xs">Sair</span>}
                </Button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" sideOffset={8}>
                  <p className="font-medium">Sair ({user.username})</p>
                </TooltipContent>
              )}
            </Tooltip>
          </>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <NavLink
                to="/auth"
                onClick={onClose}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50/80 hover:text-slate-700 transition-all duration-200',
                  collapsed ? 'justify-center p-2.5' : 'gap-2 px-2 py-2'
                )}
              >
                <div className={cn(
                  'flex items-center justify-center rounded-lg bg-slate-50 shrink-0',
                  collapsed ? 'w-9 h-9' : 'w-8 h-8'
                )}>
                  <LogIn className="h-4 w-4 text-slate-500" />
                </div>
                {!collapsed && <span className="truncate text-xs">Entrar</span>}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">Entrar</p>
              </TooltipContent>
            )}
          </Tooltip>
        )}

        {collapsed && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <NavLink
                to="/release-notes"
                onClick={onClose}
                className="flex justify-center py-1.5 text-[10px] text-slate-400 hover:text-primary font-mono transition-colors"
                title={`v${APP_VERSION} · Release ${RELEASE_ID}`}
              >
                v{APP_VERSION}
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p className="font-medium">v{APP_VERSION} · Release {RELEASE_ID}</p>
              <p className="text-xs text-muted-foreground">Clique para ver notas da versão</p>
            </TooltipContent>
          </Tooltip>
        )}
        {!collapsed && !isAuthenticated && (
          <div className="flex flex-col items-center gap-0.5 mt-2">
            <p className="text-[10px] text-slate-300 font-medium tracking-wide uppercase">
              3Maps © {new Date().getFullYear()}
            </p>
            <NavLink
              to="/release-notes"
              onClick={onClose}
              className="text-[10px] text-slate-400 hover:text-primary font-mono transition-colors"
              title="Ver notas da versão"
            >
              v{APP_VERSION} · R{RELEASE_ID}
            </NavLink>
          </div>
        )}
        {!collapsed && isAuthenticated && (
          <div className="flex flex-col items-center gap-0.5 mt-1">
            <p className="text-[10px] text-slate-300 font-medium tracking-wide uppercase">
              3Maps © {new Date().getFullYear()}
            </p>
            <NavLink
              to="/release-notes"
              onClick={onClose}
              className="text-[10px] text-slate-400 hover:text-primary font-mono transition-colors"
              title="Ver notas da versão"
            >
              v{APP_VERSION} · R{RELEASE_ID}
            </NavLink>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col relative">
        <SidebarContent collapsed={sidebarCollapsed} />
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 top-[72px] z-10 h-6 w-6 rounded-full border border-slate-200 shadow-sm bg-white hover:bg-slate-50 transition-colors"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3 w-3 text-slate-400" /> : <ChevronLeft className="h-3 w-3 text-slate-400" />}
        </Button>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-[250px]">
          <SidebarContent collapsed={false} onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
