import { Navigate, Outlet } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { Sidebar } from './Sidebar';

export function AppShell() {
  if (!auth.isLoggedIn()) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
