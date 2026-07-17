import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Monitor, Users, Zap, RefreshCw, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useQuery } from '@tanstack/react-query';
import { BrandTile } from '@/components/ui/BrandMark';

const navItems = [
  { to: '/',        label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/devices', label: 'Devices',  icon: Monitor },
  { to: '/users',   label: 'Users',    icon: Users },
  { to: '/events',  label: 'Events',   icon: Zap, live: true },
  { to: '/sync',    label: 'Sync',     icon: RefreshCw },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { data: devices } = useQuery({
    queryKey: ['devices-count'],
    queryFn: () => api.get<unknown[]>('/devices').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: users } = useQuery({
    queryKey: ['users-count'],
    queryFn: () => api.get<unknown[]>('/users').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const badgeFor = (to: string): string | null => {
    if (to === '/devices' && devices) return String(devices.length);
    if (to === '/users'   && users)   return String(users.length);
    return null;
  };

  async function handleLogout() {
    const refresh = auth.getRefresh();
    if (refresh) await api.post('/auth/logout', { refresh_token: refresh }).catch(() => null);
    auth.clear();
    disconnectSocket();
    navigate('/login');
  }

  return (
    <nav className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-5">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <BrandTile className="h-9 w-9 rounded-xl" />
        <div className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-zinc-50">Keystone</span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Monitoring &amp; Sync
          </span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, exact, live }) => {
          const badge = badgeFor(to);
          const isActive = exact ? pathname === to : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all',
                  isActive
                    ? 'bg-brand-violet text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.6)] [&_svg]:text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50',
                )
              }
            >
              <Icon className="h-[16px] w-[16px] flex-shrink-0" />
              <span>{label}</span>
              {badge && (
                <span
                  className={cn(
                    'ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  {badge}
                </span>
              )}
              {live && !badge && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-violet shadow-[0_0_8px_#a855f7]" />
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-800/40 p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#a855f7] to-[#6366f1] text-[12px] font-bold text-white">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-zinc-200">admin@localhost</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">owner</p>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-rose-500"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
