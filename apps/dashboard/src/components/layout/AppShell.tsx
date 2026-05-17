import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { Sidebar } from './Sidebar';

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export function AppShell() {
  // If we already have an access token in memory, no restore needed.
  // If we have a refresh token in sessionStorage but no access token (page refresh),
  // attempt a silent re-auth before deciding to redirect.
  const needsRestore = !auth.isLoggedIn() && !!auth.getRefresh();
  const [restoring, setRestoring] = useState(needsRestore);

  useEffect(() => {
    if (!needsRestore) return;

    api
      .post<RefreshResponse>('/auth/refresh', { refresh_token: auth.getRefresh() })
      .then(({ data }) => {
        auth.setTokens(data.access_token, data.refresh_token);
        connectSocket();
      })
      .catch(() => {
        auth.clear();
      })
      .finally(() => {
        setRestoring(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-purple-500" />
      </div>
    );
  }

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
