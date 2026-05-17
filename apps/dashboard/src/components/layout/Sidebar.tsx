import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Monitor, Users, Zap, RefreshCw, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useQuery } from '@tanstack/react-query';

const navItems = [
  { to: '/',        label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/devices', label: 'Devices',  icon: Monitor },
  { to: '/users',   label: 'Users',    icon: Users },
  { to: '/events',  label: 'Events',   icon: Zap, live: true },
  { to: '/sync',    label: 'Sync',     icon: RefreshCw },
];

export function Sidebar() {
  const navigate = useNavigate();

  // Fetch counts for badges
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
    <nav className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-4">
      {/* Logo */}
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <span className="text-xl leading-none">🔥</span>
        <span className="text-[15px] font-bold tracking-tight text-zinc-50">Smart Access</span>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-0.5">
        {navItems.map(({ to, label, icon: Icon, exact, live }) => {
          const badge = badgeFor(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-zinc-50 [&_svg]:text-purple-400'
                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
                )
              }
            >
              <Icon className="h-[15px] w-[15px] flex-shrink-0" />
              <span>{label}</span>
              {badge && (
                <span className="ml-auto rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {badge}
                </span>
              )}
              {live && !badge && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-zinc-800 pt-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-[11px] font-bold text-white">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-zinc-300">admin@localhost</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">owner</p>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="rounded p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
