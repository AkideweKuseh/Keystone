# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional Midnight Dark admin dashboard in `apps/dashboard/` that connects live to the existing NestJS API on port 3000.

**Architecture:** React 18 + Vite SPA inside the existing pnpm monorepo. Tailwind CSS v3 with shadcn/ui dark theme. axios for HTTP with JWT interceptor + silent refresh. socket.io-client for realtime event feed. React Query for server state. React Router v6 for 6 pages (Login, Overview, Devices, Users, Events, Sync).

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, React Router 6, TanStack React Query 5, axios, socket.io-client 4, Lucide React, date-fns.

---

## File Map

```
apps/dashboard/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── tsconfig.json
├── tsconfig.node.json
├── components.json               # shadcn/ui config
├── package.json
└── src/
    ├── main.tsx                  # ReactDOM.createRoot, QueryClient, Router
    ├── App.tsx                   # Routes: /login, / (protected), /devices, /users, /events, /sync
    ├── index.css                 # Tailwind directives + CSS variables (shadcn dark theme)
    ├── lib/
    │   ├── auth.ts               # Token store (memory), getToken, setTokens, clearTokens
    │   ├── api.ts                # axios instance, JWT interceptor, silent refresh
    │   └── socket.ts             # socket.io-client singleton, connect/disconnect
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx       # Full sidebar: logo, nav items with badges, user footer
    │   │   ├── Topbar.tsx        # Page title slot, live indicator, right-side action slot
    │   │   └── AppShell.tsx      # Sidebar + Topbar + <Outlet />, auth guard
    │   └── ui/
    │       ├── StatusBadge.tsx   # Online/Offline/Degraded/Unknown pill
    │       ├── EventDot.tsx      # Coloured dot for event type
    │       ├── StatCard.tsx      # Label, big value, sub-stat with colour
    │       ├── SyncBar.tsx       # Mini horizontal progress bar for sync health
    │       ├── Drawer.tsx        # Slide-in right panel (420px)
    │       ├── ConfirmDialog.tsx # "Are you sure?" modal
    │       └── Toast.tsx         # Top-right toast notification (success/error)
    └── pages/
        ├── LoginPage.tsx
        ├── OverviewPage.tsx
        ├── DevicesPage.tsx
        ├── UsersPage.tsx
        ├── EventsPage.tsx
        └── SyncPage.tsx
```

---

## Task 1: Scaffold Vite + React + TypeScript app

**Files:**

- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/index.html`
- Create: `apps/dashboard/vite.config.ts`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/tsconfig.node.json`

- [ ] **Step 1: Create `apps/dashboard/package.json`**

```json
{
  "name": "@sam/dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.7.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.400.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0",
    "socket.io-client": "^4.7.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create `apps/dashboard/index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Smart Access</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `apps/dashboard/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create `apps/dashboard/tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `apps/dashboard/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `apps/dashboard/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 7: Install dependencies**

```powershell
cd apps/dashboard
pnpm install
```

Expected: `node_modules` populated, no errors.

- [ ] **Step 8: Add dashboard to root workspace scripts**

In `package.json` (root), add to `scripts`:

```json
"dev:dashboard": "pnpm --filter @sam/dashboard dev",
```

- [ ] **Step 9: Commit**

```
git add apps/dashboard/package.json apps/dashboard/index.html apps/dashboard/vite.config.ts apps/dashboard/tsconfig*.json package.json pnpm-lock.yaml
git commit -m "chore(dashboard): scaffold Vite + React + TypeScript app"
```

---

## Task 2: Tailwind CSS + global styles

**Files:**

- Create: `apps/dashboard/tailwind.config.ts`
- Create: `apps/dashboard/postcss.config.cjs`
- Create: `apps/dashboard/src/index.css`

- [ ] **Step 1: Create `apps/dashboard/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulse: 'pulse 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
} satisfies Config;
```

- [ ] **Step 2: Create `apps/dashboard/postcss.config.cjs`**

```cjs
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `apps/dashboard/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 3.7% 10.2%;
    --card-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 270 91% 65%;
    --accent-foreground: 0 0% 98%;
    --primary: 270 91% 65%;
    --primary-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --radius: 0.5rem;
  }
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #3f3f46;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #52525b;
}
```

- [ ] **Step 4: Commit**

```
git add apps/dashboard/tailwind.config.ts apps/dashboard/postcss.config.cjs apps/dashboard/src/index.css
git commit -m "chore(dashboard): add Tailwind CSS with Midnight Dark theme variables"
```

---

## Task 3: Auth layer — token store, API client, socket singleton

**Files:**

- Create: `apps/dashboard/src/lib/auth.ts`
- Create: `apps/dashboard/src/lib/api.ts`
- Create: `apps/dashboard/src/lib/socket.ts`

- [ ] **Step 1: Create `apps/dashboard/src/lib/auth.ts`**

```typescript
// In-memory token store. Never touches localStorage (per security spec).
// sessionStorage holds refresh_token only so page refresh doesn't fully log out.

let accessToken: string | null = null;

export const auth = {
  getAccess: () => accessToken,
  getRefresh: () => sessionStorage.getItem('refresh_token'),
  setTokens: (access: string, refresh: string) => {
    accessToken = access;
    sessionStorage.setItem('refresh_token', refresh);
  },
  clear: () => {
    accessToken = null;
    sessionStorage.removeItem('refresh_token');
  },
  isLoggedIn: () => accessToken !== null,
};
```

- [ ] **Step 2: Create `apps/dashboard/src/lib/api.ts`**

```typescript
import axios from 'axios';
import { auth } from './auth';

export const api = axios.create({ baseURL: '/api/v1' });

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = auth.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<void> | null = null;

// Silent refresh on 401, retry once
api.interceptors.response.use(
  (r) => r,
  async (error: unknown) => {
    const err = error as {
      config?: { _retry?: boolean; headers?: Record<string, string>; url?: string };
      response?: { status: number };
    };
    if (err.response?.status !== 401 || err.config?._retry) {
      return Promise.reject(error);
    }
    const refreshToken = auth.getRefresh();
    if (!refreshToken) {
      auth.clear();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (!refreshing) {
      refreshing = api
        .post<{ access_token: string; refresh_token: string }>('/auth/refresh', {
          refresh_token: refreshToken,
        })
        .then(({ data }) => {
          auth.setTokens(data.access_token, data.refresh_token);
        })
        .catch(() => {
          auth.clear();
          window.location.href = '/login';
        })
        .finally(() => {
          refreshing = null;
        });
    }

    await refreshing;

    if (!err.config) return Promise.reject(error);
    err.config._retry = true;
    if (err.config.headers) {
      err.config.headers['Authorization'] = `Bearer ${auth.getAccess() ?? ''}`;
    }
    return api(err.config);
  },
);
```

- [ ] **Step 3: Create `apps/dashboard/src/lib/socket.ts`**

```typescript
import { io, type Socket } from 'socket.io-client';
import { auth } from './auth';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io('/', {
    path: '/socket.io',
    auth: { token: auth.getAccess() ?? '' },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
```

- [ ] **Step 4: Commit**

```
git add apps/dashboard/src/lib/
git commit -m "feat(dashboard): add auth token store, axios JWT interceptor, socket.io singleton"
```

---

## Task 4: UI atoms — StatusBadge, EventDot, StatCard, SyncBar, cn utility

**Files:**

- Create: `apps/dashboard/src/lib/utils.ts`
- Create: `apps/dashboard/src/components/ui/StatusBadge.tsx`
- Create: `apps/dashboard/src/components/ui/EventDot.tsx`
- Create: `apps/dashboard/src/components/ui/StatCard.tsx`
- Create: `apps/dashboard/src/components/ui/SyncBar.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `apps/dashboard/src/components/ui/StatusBadge.tsx`**

```tsx
import { cn } from '@/lib/utils';

type Status = 'online' | 'offline' | 'degraded' | 'unknown' | 'disabled';

const config: Record<Status, { dot: string; text: string; bg: string }> = {
  online: { dot: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10' },
  degraded: { dot: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  offline: { dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
  disabled: { dot: 'bg-zinc-600', text: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  unknown: { dot: 'bg-zinc-600', text: 'text-zinc-400', bg: 'bg-zinc-500/10' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status in config ? status : 'unknown') as Status;
  const { dot, text, bg } = config[s];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        bg,
        text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/src/components/ui/EventDot.tsx`**

```tsx
import { cn } from '@/lib/utils';

const eventColors: Record<string, string> = {
  access_granted: 'bg-green-500 shadow-green-500/50',
  access_denied: 'bg-red-500 shadow-red-500/50',
  tamper: 'bg-amber-500 shadow-amber-500/50',
  door_opened: 'bg-blue-500 shadow-blue-500/50',
  door_closed: 'bg-zinc-500 shadow-zinc-500/50',
  forced_entry: 'bg-red-600 shadow-red-600/50',
  device_offline: 'bg-zinc-500 shadow-zinc-500/50',
  device_online: 'bg-green-500 shadow-green-500/50',
};

export function EventDot({ type }: { type: string }) {
  const color = eventColors[type] ?? 'bg-zinc-500 shadow-zinc-500/50';
  return <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full shadow-[0_0_6px]', color)} />;
}
```

- [ ] **Step 4: Create `apps/dashboard/src/components/ui/StatCard.tsx`**

```tsx
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: ReactNode;
  valueColor?: string;
}

export function StatCard({ label, value, sub, valueColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={cn('text-3xl font-bold tracking-tight text-zinc-50', valueColor)}>{value}</p>
      {sub && <div className="mt-2 flex items-center gap-1 text-[11px] font-medium">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/dashboard/src/components/ui/SyncBar.tsx`**

```tsx
// Mini horizontal sync health bar: green=synced, amber=pending, red=failed
interface SyncBarProps {
  synced: number;
  pending: number;
  failed: number;
}

export function SyncBar({ synced, pending, failed }: SyncBarProps) {
  const total = synced + pending + failed;
  if (total === 0) return <span className="text-xs text-zinc-600">—</span>;

  const pctSynced = (synced / total) * 100;
  const pctPending = (pending / total) * 100;
  const pctFailed = (failed / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
        {pctSynced > 0 && <div className="bg-green-500" style={{ width: `${pctSynced}%` }} />}
        {pctPending > 0 && <div className="bg-amber-500" style={{ width: `${pctPending}%` }} />}
        {pctFailed > 0 && <div className="bg-red-500" style={{ width: `${pctFailed}%` }} />}
      </div>
      <span className="text-xs text-zinc-500">
        {synced}/{total}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```
git add apps/dashboard/src/lib/utils.ts apps/dashboard/src/components/ui/
git commit -m "feat(dashboard): add StatusBadge, EventDot, StatCard, SyncBar atoms"
```

---

## Task 5: Layout shell — Sidebar, Topbar, AppShell, auth guard

**Files:**

- Create: `apps/dashboard/src/components/layout/Sidebar.tsx`
- Create: `apps/dashboard/src/components/layout/Topbar.tsx`
- Create: `apps/dashboard/src/components/layout/AppShell.tsx`
- Create: `apps/dashboard/src/components/ui/Drawer.tsx`
- Create: `apps/dashboard/src/components/ui/Toast.tsx`
- Create: `apps/dashboard/src/components/ui/ConfirmDialog.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/layout/Sidebar.tsx`**

```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Monitor, Users, Zap, RefreshCw, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useQuery } from '@tanstack/react-query';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/devices', label: 'Devices', icon: Monitor },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/events', label: 'Events', icon: Zap, live: true },
  { to: '/sync', label: 'Sync', icon: RefreshCw },
];

export function Sidebar() {
  const navigate = useNavigate();

  // Fetch counts for badges
  const { data: devices } = useQuery({
    queryKey: ['devices-count'],
    queryFn: () => api.get<unknown[]>('/devices').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: users } = useQuery({
    queryKey: ['users-count'],
    queryFn: () => api.get<unknown[]>('/users').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const badgeFor = (to: string): string | null => {
    if (to === '/devices' && devices) return String(devices.length);
    if (to === '/users' && users) return String(users.length);
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
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              owner
            </p>
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
```

- [ ] **Step 2: Create `apps/dashboard/src/components/layout/Topbar.tsx`**

```tsx
import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  live?: boolean;
  actions?: ReactNode;
}

export function Topbar({ title, live = false, actions }: TopbarProps) {
  return (
    <header className="flex h-[54px] flex-shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
      <h1 className="text-[16px] font-bold tracking-tight text-zinc-50">{title}</h1>
      {live && (
        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
          <span className="text-[12px] font-medium text-zinc-500">Live</span>
        </div>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/src/components/layout/AppShell.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `apps/dashboard/src/components/ui/Drawer.tsx`**

```tsx
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, children, width = 'w-[420px]' }: DrawerProps) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl animate-slide-in overflow-hidden',
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-50">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Create `apps/dashboard/src/components/ui/Toast.tsx`**

```tsx
import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastId = 0;
let globalPush: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  globalPush?.({ message, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    globalPush = push;
    return () => {
      globalPush = null;
    };
  }, [push]);

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in',
            t.type === 'success'
              ? 'border-green-800 bg-green-950 text-green-300'
              : 'border-red-800 bg-red-950 text-red-300',
          )}
        >
          {t.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {t.message}
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/dashboard/src/components/ui/ConfirmDialog.tsx`**

```tsx
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[400px] rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          {danger && <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-400" />}
          <h3 className="text-[15px] font-semibold text-zinc-50">{title}</h3>
        </div>
        <p className="mb-6 text-sm text-zinc-400">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```
git add apps/dashboard/src/components/
git commit -m "feat(dashboard): add Sidebar, Topbar, AppShell, Drawer, Toast, ConfirmDialog"
```

---

## Task 6: App entry point + Login page

**Files:**

- Create: `apps/dashboard/src/main.tsx`
- Create: `apps/dashboard/src/App.tsx`
- Create: `apps/dashboard/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from '@/components/ui/Toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Create `apps/dashboard/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { UsersPage } from '@/pages/UsersPage';
import { EventsPage } from '@/pages/EventsPage';
import { SyncPage } from '@/pages/SyncPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/sync" element={<SyncPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/src/pages/LoginPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { connectSocket } from '@/lib/socket';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; role: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@localhost');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      auth.setTokens(data.access_token, data.refresh_token);
      connectSocket();
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ??
        'Sign in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="text-4xl">🔥</span>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Smart Access</h1>
          <p className="text-sm text-zinc-500">Sign in to your account</p>
        </div>

        {/* Card */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
        >
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Email
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="admin@localhost"
              required
              autoFocus
            />
          </div>
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create stub pages so the app compiles**

Create these files — each is a one-liner placeholder replaced in later tasks:

`apps/dashboard/src/pages/OverviewPage.tsx`:

```tsx
export function OverviewPage() {
  return <div className="p-6 text-zinc-400">Overview — coming in next task</div>;
}
```

`apps/dashboard/src/pages/DevicesPage.tsx`:

```tsx
export function DevicesPage() {
  return <div className="p-6 text-zinc-400">Devices — coming in next task</div>;
}
```

`apps/dashboard/src/pages/UsersPage.tsx`:

```tsx
export function UsersPage() {
  return <div className="p-6 text-zinc-400">Users — coming in next task</div>;
}
```

`apps/dashboard/src/pages/EventsPage.tsx`:

```tsx
export function EventsPage() {
  return <div className="p-6 text-zinc-400">Events — coming in next task</div>;
}
```

`apps/dashboard/src/pages/SyncPage.tsx`:

```tsx
export function SyncPage() {
  return <div className="p-6 text-zinc-400">Sync — coming in next task</div>;
}
```

- [ ] **Step 5: Start the dev server and verify the login page renders**

```powershell
# In project root — ensure API is running first (pnpm run dev:all in another terminal)
pnpm run dev:dashboard
```

Open `http://localhost:5173` — you should see the login page with 🔥 logo.
Sign in with `admin@localhost` / `changeme123` — should redirect to overview stub.

- [ ] **Step 6: Commit**

```
git add apps/dashboard/src/
git commit -m "feat(dashboard): add routing, login page with JWT auth, page stubs"
```

---

## Task 7: Overview page

**Files:**

- Modify: `apps/dashboard/src/pages/OverviewPage.tsx` (replace stub)

- [ ] **Step 1: Replace OverviewPage stub with full implementation**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EventDot } from '@/components/ui/EventDot';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';

interface Device {
  id: string;
  name: string;
  status: string;
  vendor: string;
  ipAddress: string;
  lastSeenAt: string | null;
}

interface LiveEvent {
  id: string;
  type: string;
  employeeNo?: string;
  userId?: string;
  deviceId?: string;
  eventTime: string;
  isNew?: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  return formatDistanceToNow(new Date(iso), { addSuffix: false });
}

export function OverviewPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const socketRef = useRef(connectSocket());

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: eventsData } = useQuery<{
    data: { id: string; eventTime: string; eventType: string; employeeNo?: string }[];
  }>({
    queryKey: ['events-today'],
    queryFn: () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      return api
        .get('/events', { params: { from: from.toISOString(), limit: 100 } })
        .then((r) => r.data);
    },
    refetchInterval: 60_000,
  });

  const { data: syncFailures } = useQuery<{ data: unknown[] }>({
    queryKey: ['sync-failures'],
    queryFn: () => api.get('/sync/failures').then((r) => r.data),
    refetchInterval: 30_000,
  });

  // WebSocket live feed
  useEffect(() => {
    const socket = socketRef.current;
    socket.on('event', (e: LiveEvent) => {
      setEvents((prev) => [{ ...e, isNew: true }, ...prev].slice(0, 20));
      setTimeout(() => {
        setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, isNew: false } : x)));
      }, 3000);
    });
    return () => {
      socket.off('event');
    };
  }, []);

  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const todayCount = eventsData?.data?.length ?? 0;
  const failCount = syncFailures?.data?.length ?? 0;
  const displayDevices = [...devices]
    .sort((a, b) => {
      const order: Record<string, number> = {
        online: 0,
        degraded: 1,
        unknown: 2,
        offline: 3,
        disabled: 4,
      };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    })
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Overview"
        live
        actions={
          <>
            <button
              onClick={() => navigate('/devices')}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            >
              Register Device
            </button>
            <button
              onClick={() => navigate('/users')}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              Add User
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="mb-5 grid grid-cols-4 gap-3">
          <StatCard
            label="Devices Online"
            value={onlineCount}
            sub={<span className="text-zinc-500">of {devices.length} total</span>}
          />
          <StatCard
            label="Events Today"
            value={todayCount.toLocaleString()}
            sub={<span className="text-zinc-500">last 24h</span>}
          />
          <StatCard
            label="Sync Failures"
            value={failCount}
            valueColor={failCount > 0 ? 'text-red-400' : undefined}
            sub={
              failCount > 0 ? (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertTriangle className="h-3 w-3" /> need attention
                </span>
              ) : (
                <span className="text-zinc-500">all clear</span>
              )
            }
          />
          <StatCard
            label="Total Devices"
            value={devices.length}
            sub={<span className="text-zinc-500">registered</span>}
          />
        </div>

        {/* Bottom split */}
        <div className="grid grid-cols-[1fr_340px] gap-4">
          {/* Device table */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <h3 className="text-[13px] font-semibold text-zinc-50">Devices</h3>
              <button
                onClick={() => navigate('/devices')}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Status', 'Vendor', 'IP Address', 'Last Seen'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayDevices.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate('/devices')}
                    className="cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors last:border-0"
                  >
                    <td className="px-5 py-3 text-[13px] font-semibold text-zinc-100">{d.name}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-5 py-3 text-[13px] capitalize text-zinc-500">{d.vendor}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-zinc-500">{d.ipAddress}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">{timeAgo(d.lastSeenAt)}</td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-zinc-600">
                      No devices registered yet.{' '}
                      <button
                        onClick={() => navigate('/devices')}
                        className="text-purple-400 hover:underline"
                      >
                        Register one →
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Live event feed */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3.5">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
              <h3 className="text-[13px] font-semibold text-zinc-50">Live Events</h3>
            </div>
            <div className="flex flex-col divide-y divide-zinc-800/50">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <EventDot type={e.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-200">
                      {e.employeeNo ?? 'Unknown'}
                      {e.isNew && (
                        <span className="ml-1.5 rounded bg-purple-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-400">
                          new
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-600">{e.type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-600">
                    {timeAgo(e.eventTime)}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-zinc-600">
                  Waiting for events…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Open `http://localhost:5173` and verify**

- Stat cards show live counts from the API
- Device table shows registered devices
- Live events panel shows "Waiting for events…" (or events if any were pushed)

- [ ] **Step 3: Commit**

```
git add apps/dashboard/src/pages/OverviewPage.tsx
git commit -m "feat(dashboard): implement Overview page with stats, device table, live event feed"
```

---

## Task 8: Devices page

**Files:**

- Modify: `apps/dashboard/src/pages/DevicesPage.tsx`

- [ ] **Step 1: Replace DevicesPage stub**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Unlock, Plus, RefreshCw, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topbar } from '@/components/layout/Topbar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  status: string;
  vendor: string;
  model: string | null;
  ipAddress: string;
  port: number;
  username: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  capabilities: {
    supportsJson: boolean;
    supportsFace: boolean;
    supportsFp: boolean;
    maxUsers: number | null;
    maxCards: number | null;
  } | null;
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-200 font-mono">{value ?? '—'}</span>
    </div>
  );
}

function Chip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-600'}`}
    >
      {label}
    </span>
  );
}

export function DevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Device | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  // Register form state
  const [form, setForm] = useState({
    name: '',
    vendor: 'mock',
    ipAddress: '127.0.0.1',
    port: '80',
    username: 'admin',
    password: '',
  });

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const unlock = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/unlock`, { door_index: 1 }),
    onSuccess: () => toast('Door unlocked', 'success'),
    onError: () => toast('Unlock failed — check device is online', 'error'),
  });

  const healthCheck = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/health-check`),
    onSuccess: () => {
      toast('Health check queued', 'success');
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const disable = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/${id}`),
    onSuccess: () => {
      toast('Device disabled', 'success');
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: () => toast('Failed to disable device', 'error'),
  });

  const register = useMutation({
    mutationFn: () => api.post('/devices', { ...form, port: Number(form.port) }),
    onSuccess: () => {
      toast('Device registered — discovering capabilities…', 'success');
      setShowRegister(false);
      setForm({
        name: '',
        vendor: 'mock',
        ipAddress: '127.0.0.1',
        port: '80',
        username: 'admin',
        password: '',
      });
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: () => toast('Registration failed — check IP and credentials', 'error'),
  });

  const filtered = devices.filter((d) =>
    [d.name, d.ipAddress, d.vendor, d.model].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Devices"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="rounded-lg border border-zinc-700 bg-zinc-800/60 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none w-48"
              />
            </div>
            <button
              onClick={() => setShowRegister(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Register Device
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-zinc-600">
              Loading…
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Status', 'Vendor', 'Model', 'IP Address', 'Last Seen', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors last:border-0"
                  >
                    <td className="px-5 py-3 text-[13px] font-semibold text-zinc-100">{d.name}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-5 py-3 text-[13px] capitalize text-zinc-400">{d.vendor}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">{d.model ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-zinc-500">
                      {d.ipAddress}:{d.port}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">
                      {d.lastSeenAt
                        ? formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      {d.status === 'online' && (
                        <button
                          onClick={() => unlock.mutate(d.id)}
                          disabled={unlock.isPending}
                          className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                        >
                          <Unlock className="h-3 w-3" /> Unlock
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-zinc-600">
                      {search ? 'No devices match your search.' : 'No devices registered yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected && (
          <div className="flex flex-col gap-5">
            <div>
              <StatusBadge status={selected.status} />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Device Info
              </p>
              <div className="rounded-lg border border-zinc-800 px-3">
                <InfoRow label="IP Address" value={`${selected.ipAddress}:${selected.port}`} />
                <InfoRow label="Vendor" value={selected.vendor} />
                <InfoRow label="Model" value={selected.model} />
                <InfoRow label="Firmware" value={selected.firmwareVersion} />
                <InfoRow label="Serial" value={selected.serialNumber} />
              </div>
            </div>

            {selected.capabilities && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  Capabilities
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="JSON API" active={selected.capabilities.supportsJson} />
                  <Chip label="Face" active={selected.capabilities.supportsFace} />
                  <Chip label="Fingerprint" active={selected.capabilities.supportsFp} />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                  {selected.capabilities.maxUsers != null && (
                    <span>Max users: {selected.capabilities.maxUsers.toLocaleString()}</span>
                  )}
                  {selected.capabilities.maxCards != null && (
                    <span>Max cards: {selected.capabilities.maxCards.toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                disabled={selected.status !== 'online' || unlock.isPending}
                onClick={() => unlock.mutate(selected.id)}
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                <Unlock className="h-4 w-4" /> Unlock Door
              </button>
              <button
                onClick={() => healthCheck.mutate(selected.id)}
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className="h-4 w-4" /> Force Health Check
              </button>
              <button
                onClick={() => setConfirmDisable(true)}
                className="flex items-center justify-center gap-2 rounded-lg border border-red-900/50 py-2 text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors mt-2"
              >
                Disable Device
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Disable confirm */}
      <ConfirmDialog
        open={confirmDisable}
        title="Disable this device?"
        description={`"${selected?.name}" will be set to disabled. All sync jobs will stop. You can re-enable it later by updating the status.`}
        confirmLabel="Disable"
        danger
        onConfirm={() => {
          if (selected) disable.mutate(selected.id);
          setConfirmDisable(false);
        }}
        onCancel={() => setConfirmDisable(false)}
      />

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[460px] rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-5 text-[15px] font-semibold text-zinc-50">Register Device</h3>
            <div className="flex flex-col gap-3">
              {(
                [
                  { label: 'Name', key: 'name', placeholder: 'HQ Lobby Reader' },
                  { label: 'IP Address', key: 'ipAddress', placeholder: '10.10.0.21' },
                  { label: 'Port', key: 'port', placeholder: '80' },
                  { label: 'Username', key: 'username', placeholder: 'admin' },
                  { label: 'Password', key: 'password', placeholder: '••••••••', type: 'password' },
                ] as const
              ).map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {label}
                  </label>
                  <input
                    type={type ?? 'text'}
                    value={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Vendor
                </label>
                <select
                  value={form.vendor}
                  onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="mock">Mock (local dev)</option>
                  <option value="hikvision">Hikvision</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowRegister(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => register.mutate()}
                disabled={register.isPending || !form.name || !form.password}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {register.isPending ? 'Registering…' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/devices`. You should see:

- Table of devices with status badges
- Click a device row → drawer slides in from right
- Unlock button only visible for online devices
- Register Device modal opens correctly

- [ ] **Step 3: Commit**

```
git add apps/dashboard/src/pages/DevicesPage.tsx
git commit -m "feat(dashboard): implement Devices page with table, detail drawer, register modal"
```

---

## Task 9: Users page

**Files:**

- Modify: `apps/dashboard/src/pages/UsersPage.tsx`

- [ ] **Step 1: Replace UsersPage stub**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SyncBar } from '@/components/ui/SyncBar';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

interface User {
  id: string;
  employeeNo: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  updatedAt: string;
}

interface SyncStatus {
  user_id: string;
  devices: Array<{
    device_id: string;
    name?: string;
    syncStatus?: string;
    sync_status?: string;
    lastSyncedAt?: string;
    last_synced_at?: string;
    errorMessage?: string;
    error_message?: string;
  }>;
}

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [form, setForm] = useState({ employeeNo: '', firstName: '', lastName: '', email: '' });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ['user-sync', selected?.id],
    queryFn: () => api.get<SyncStatus>(`/users/${selected!.id}/sync-status`).then((r) => r.data),
    enabled: !!selected,
    refetchInterval: 10_000,
  });

  const resync = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/resync`),
    onSuccess: () => {
      toast('Resync queued for all devices', 'success');
      void qc.invalidateQueries({ queryKey: ['user-sync', selected?.id] });
    },
    onError: () => toast('Resync failed', 'error'),
  });

  const terminate = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast('User terminated — removing from devices…', 'success');
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast('Failed to terminate user', 'error'),
  });

  const addUser = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: (res) => {
      const d = res.data as { sync_targets?: number };
      toast(`User created — syncing to ${d.sync_targets ?? 0} devices`, 'success');
      setShowAdd(false);
      setForm({ employeeNo: '', firstName: '', lastName: '', email: '' });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast('Failed to create user', 'error'),
  });

  const filtered = users.filter((u) =>
    [u.employeeNo, u.firstName, u.lastName, u.email].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  function getSyncSummary(userId: string) {
    // Placeholder counts — real data comes from syncStatus drawer
    void userId;
    return { synced: 0, pending: 0, failed: 0 };
  }

  const syncDevices = syncStatus?.devices ?? [];
  const syncSynced = syncDevices.filter((d) => (d.syncStatus ?? d.sync_status) === 'synced').length;
  const syncPending = syncDevices.filter((d) =>
    ['pending', 'in_progress'].includes(d.syncStatus ?? d.sync_status ?? ''),
  ).length;
  const syncFailed = syncDevices.filter((d) => (d.syncStatus ?? d.sync_status) === 'failed').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Users"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="rounded-lg border border-zinc-700 bg-zinc-800/60 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none w-48"
              />
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add User
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-zinc-600">
              Loading…
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Employee No', 'Name', 'Email', 'Status', 'Sync Health'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const { synced, pending, failed } = getSyncSummary(u.id);
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u)}
                      className="cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors last:border-0"
                    >
                      <td className="px-5 py-3 font-mono text-[12px] text-zinc-400">
                        {u.employeeNo}
                      </td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-zinc-100">
                        {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-zinc-500">{u.email ?? '—'}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-5 py-3">
                        <SyncBar synced={synced} pending={pending} failed={failed} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-600">
                      {search ? 'No users match your search.' : 'No users yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          [selected?.firstName, selected?.lastName].filter(Boolean).join(' ') ||
          selected?.employeeNo ||
          ''
        }
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <StatusBadge status={selected.status} />
              <span className="font-mono text-xs text-zinc-500">{selected.employeeNo}</span>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  Sync Status
                </p>
                <span className="text-xs text-zinc-500">
                  {syncSynced}/{syncDevices.length} synced
                </span>
              </div>
              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 p-2">
                {syncDevices.length === 0 && (
                  <p className="py-3 text-center text-xs text-zinc-600">No devices assigned</p>
                )}
                {syncDevices.map((d) => {
                  const status = d.syncStatus ?? d.sync_status ?? 'unknown';
                  return (
                    <div key={d.device_id} className="flex items-center gap-2 rounded px-2 py-1.5">
                      <StatusBadge
                        status={
                          status === 'synced'
                            ? 'online'
                            : status === 'failed'
                              ? 'offline'
                              : 'degraded'
                        }
                      />
                      <span className="flex-1 text-xs text-zinc-400">
                        {d.name ?? d.device_id.slice(0, 8)}
                      </span>
                      {d.errorMessage && (
                        <span className="max-w-[120px] truncate text-[10px] text-red-400">
                          {d.errorMessage}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => resync.mutate(selected.id)}
                disabled={resync.isPending}
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                {resync.isPending ? 'Queuing…' : 'Resync All Devices'}
              </button>
              {selected.status !== 'terminated' && (
                <button
                  onClick={() => setConfirmTerminate(true)}
                  className="mt-2 flex items-center justify-center rounded-lg border border-red-900/50 py-2 text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors"
                >
                  Terminate User
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmTerminate}
        title="Terminate this user?"
        description={`${selected?.firstName ?? selected?.employeeNo} will be removed from all devices. This cannot be undone.`}
        confirmLabel="Terminate"
        danger
        onConfirm={() => {
          if (selected) terminate.mutate(selected.id);
          setConfirmTerminate(false);
        }}
        onCancel={() => setConfirmTerminate(false)}
      />

      {/* Add user modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[420px] rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-5 text-[15px] font-semibold text-zinc-50">Add User</h3>
            <div className="flex flex-col gap-3">
              {(
                [
                  { label: 'Employee No *', key: 'employeeNo', placeholder: 'EMP00123' },
                  { label: 'First Name', key: 'firstName', placeholder: 'Ada' },
                  { label: 'Last Name', key: 'lastName', placeholder: 'Lovelace' },
                  { label: 'Email', key: 'email', placeholder: 'ada@example.com' },
                ] as const
              ).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {label}
                  </label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addUser.mutate()}
                disabled={addUser.isPending || !form.employeeNo}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {addUser.isPending ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser** — create a user, see it appear in the table, click to open drawer, check sync status.

- [ ] **Step 3: Commit**

```
git add apps/dashboard/src/pages/UsersPage.tsx
git commit -m "feat(dashboard): implement Users page with table, sync status drawer, add user modal"
```

---

## Task 10: Events page

**Files:**

- Modify: `apps/dashboard/src/pages/EventsPage.tsx`

- [ ] **Step 1: Replace EventsPage stub**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { EventDot } from '@/components/ui/EventDot';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';

interface ApiEvent {
  id: string;
  eventType: string;
  eventTime: string;
  employeeNo: string | null;
  deviceId: string | null;
  userId: string | null;
}

interface LiveEvent extends ApiEvent {
  isNew?: boolean;
}

const EVENT_TYPES = [
  'all',
  'access_granted',
  'access_denied',
  'tamper',
  'door_opened',
  'forced_entry',
];

export function EventsPage() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(connectSocket());

  const {
    data: historyData,
    isFetching,
    refetch,
  } = useQuery<{ data: ApiEvent[]; next_cursor: string | null }>({
    queryKey: ['events', typeFilter, cursor],
    queryFn: () =>
      api
        .get('/events', {
          params: {
            limit: 40,
            ...(typeFilter !== 'all' ? { event_type: typeFilter } : {}),
            ...(cursor ? { cursor } : {}),
          },
        })
        .then((r) => r.data),
    staleTime: 10_000,
  });

  // Live WebSocket feed
  useEffect(() => {
    const socket = socketRef.current;
    socket.on('event', (e: ApiEvent) => {
      if (!paused) {
        setLiveEvents((prev) => [{ ...e, isNew: true }, ...prev].slice(0, 50));
        setTimeout(
          () =>
            setLiveEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, isNew: false } : x))),
          3000,
        );
      }
    });
    return () => {
      socket.off('event');
    };
  }, [paused]);

  // Detect manual scroll to pause
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const handler = () => setPaused(el.scrollTop > 20);
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Events"
        live
        actions={
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCursor(null);
              void refetch();
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-purple-500 focus:outline-none"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All events' : t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 overflow-hidden">
        {/* Left: live feed */}
        <div className="flex flex-col overflow-hidden border-r border-zinc-800">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
            <span className="text-[13px] font-semibold text-zinc-50">Live Feed</span>
            {paused && (
              <button
                onClick={() => {
                  setPaused(false);
                  feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <ChevronDown className="h-3 w-3" /> Resume
              </button>
            )}
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
            {liveEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <EventDot type={e.eventType} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-100">
                    {e.employeeNo ?? 'Unknown'}
                    {e.isNew && (
                      <span className="ml-1.5 rounded bg-purple-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-400">
                        new
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {e.eventType.replace(/_/g, ' ')} · {format(new Date(e.eventTime), 'HH:mm:ss')}
                  </p>
                </div>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-600">
                  {formatDistanceToNow(new Date(e.eventTime))}
                </span>
              </div>
            ))}
            {liveEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-zinc-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-purple-500/50" />
                Waiting for events…
              </div>
            )}
          </div>
        </div>

        {/* Right: history */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center border-b border-zinc-800 px-5 py-3">
            <span className="text-[13px] font-semibold text-zinc-50">History</span>
            <span className="ml-2 text-xs text-zinc-500">
              {typeFilter !== 'all' ? `· ${typeFilter.replace(/_/g, ' ')}` : ''}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
            {historyData?.data.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <EventDot type={e.eventType} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-100">
                    {e.employeeNo ?? 'Unknown'}
                  </p>
                  <p className="text-[11px] text-zinc-500">{e.eventType.replace(/_/g, ' ')}</p>
                </div>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-600">
                  {format(new Date(e.eventTime), 'MMM d, HH:mm')}
                </span>
              </div>
            ))}
            {historyData?.next_cursor && (
              <button
                onClick={() => setCursor(historyData.next_cursor)}
                disabled={isFetching}
                className="w-full py-3 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50 transition-colors"
              >
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            )}
            {!isFetching && historyData?.data.length === 0 && (
              <div className="py-20 text-center text-sm text-zinc-600">No events found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser** — live feed shows "Waiting for events…", history shows events from `/api/v1/events`.

- [ ] **Step 3: Commit**

```
git add apps/dashboard/src/pages/EventsPage.tsx
git commit -m "feat(dashboard): implement Events page with live WebSocket feed and history"
```

---

## Task 11: Sync page

**Files:**

- Modify: `apps/dashboard/src/pages/SyncPage.tsx`

- [ ] **Step 1: Replace SyncPage stub**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topbar } from '@/components/layout/Topbar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  failed: number;
}

interface SyncStatusResponse {
  queues: QueueInfo[];
}

interface FailureRow {
  deviceId: string;
  userId: string;
  syncStatus: string;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: string | null;
  device?: { name: string };
  user?: { employeeNo: string; firstName: string | null; lastName: string | null };
}

function QueueCard({ q }: { q: QueueInfo }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
        {q.name}
      </p>
      <div className="flex gap-4">
        <div>
          <p className="text-2xl font-bold text-zinc-50">{q.waiting}</p>
          <p className="text-[10px] text-zinc-600">waiting</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-50">{q.active}</p>
          <p className="text-[10px] text-zinc-600">active</p>
        </div>
        {q.failed > 0 && (
          <div>
            <p className="text-2xl font-bold text-red-400">{q.failed}</p>
            <p className="text-[10px] text-zinc-600">failed</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SyncPage() {
  const qc = useQueryClient();

  const { data: syncData } = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatusResponse>('/sync/status').then((r) => r.data),
    refetchInterval: 10_000,
  });

  const { data: failures } = useQuery<{ data: FailureRow[] }>({
    queryKey: ['sync-failures'],
    queryFn: () => api.get('/sync/failures').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const reconcile = useMutation({
    mutationFn: () => api.post('/sync/run', { scope: 'all' }),
    onSuccess: () => {
      toast('Reconciliation started for all devices', 'success');
      void qc.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: () => toast('Failed to start reconciliation', 'error'),
  });

  const resyncRow = useMutation({
    mutationFn: (userId: string) => api.post(`/users/${userId}/resync`),
    onSuccess: () => {
      toast('Resync queued', 'success');
      void qc.invalidateQueries({ queryKey: ['sync-failures'] });
    },
    onError: () => toast('Resync failed', 'error'),
  });

  const failureList = failures?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Sync Health"
        actions={
          <button
            onClick={() => reconcile.mutate()}
            disabled={reconcile.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {reconcile.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Reconcile All
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Queue cards */}
        {syncData?.queues && syncData.queues.length > 0 && (
          <div className="mb-6 grid grid-cols-3 gap-3">
            {syncData.queues.map((q) => (
              <QueueCard key={q.name} q={q} />
            ))}
          </div>
        )}

        {/* Failures table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div>
              <h3 className="text-[13px] font-semibold text-zinc-50">Sync Failures</h3>
              <p className="text-[11px] text-zinc-600">{failureList.length} items need attention</p>
            </div>
            {failureList.length > 0 && (
              <button
                onClick={() => failureList.forEach((f) => resyncRow.mutate(f.userId))}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Resync All Failed
              </button>
            )}
          </div>

          {failureList.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-green-400">
              ✓ No sync failures — all devices in sync
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['User', 'Device', 'Error', 'Retries', 'Last Attempt', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failureList.map((f, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-5 py-3 text-[13px] text-zinc-200">
                      {[f.user?.firstName, f.user?.lastName].filter(Boolean).join(' ') ||
                        f.user?.employeeNo ||
                        f.userId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-zinc-400">
                      {f.device?.name ?? f.deviceId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3 max-w-[200px]">
                      <StatusBadge status="offline" />
                      {f.errorMessage && (
                        <p className="mt-1 truncate text-[11px] text-red-400">{f.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">{f.retryCount}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">
                      {f.lastAttemptAt
                        ? formatDistanceToNow(new Date(f.lastAttemptAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => resyncRow.mutate(f.userId)}
                        className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        Resync
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser** — queue cards show counts, failures table shows "No sync failures" if all clear.

- [ ] **Step 3: Commit**

```
git add apps/dashboard/src/pages/SyncPage.tsx
git commit -m "feat(dashboard): implement Sync page with queue health cards and failure table"
```

---

## Task 12: Wire into monorepo + final polish

**Files:**

- Modify: `package.json` (root) — already done in Task 1
- Add `apps/dashboard` to `.gitignore` dist exclusion

- [ ] **Step 1: Verify `pnpm run dev:dashboard` works from root**

```powershell
# From project root
pnpm run dev:dashboard
```

Expected: Vite dev server starts at `http://localhost:5173`.

- [ ] **Step 2: Add dashboard build to root build script**

In root `package.json`, the `build` script already runs `pnpm -r build` which will include `@sam/dashboard`. Verify:

```powershell
pnpm build 2>&1 | Select-Object -Last 5
```

Expected: exits 0.

- [ ] **Step 3: Add `apps/dashboard/dist` to `.gitignore`**

Verify `.gitignore` contains `dist/` — it does (added in Phase 0). No change needed.

- [ ] **Step 4: Update root README with dashboard instructions**

Add to the Scripts table in `README.md`:

| `pnpm run dev:dashboard` | Start the admin dashboard at http://localhost:5173 |

- [ ] **Step 5: Full end-to-end manual verification**

1. Start API + worker + receiver: `pnpm run dev:all` (in one terminal)
2. Start dashboard: `pnpm run dev:dashboard` (in another terminal)
3. Open `http://localhost:5173`
4. Sign in with `admin@localhost` / `changeme123`
5. Register a mock device → verify it appears in Overview + Devices
6. Create a user → verify it appears in Users, sync-status drawer shows device
7. Navigate to Events → verify live feed connects
8. Navigate to Sync → verify queue health shows

- [ ] **Step 6: Final commit + tag**

```
git add apps/dashboard/ README.md package.json pnpm-lock.yaml
git commit -m "feat(dashboard): complete admin dashboard — all 6 pages, live events, Midnight Dark"
git tag v0.0.0-dashboard
```

---

## Self-Review Against Spec

| Spec requirement                    | Task                                     |
| ----------------------------------- | ---------------------------------------- |
| Inter font                          | Task 2 (index.css) + Task 6 (index.html) |
| Midnight Dark theme                 | Task 2 (CSS vars + Tailwind)             |
| 🔥 logo                             | Task 5 (Sidebar)                         |
| Full sidebar nav                    | Task 5 (Sidebar)                         |
| JWT auth with silent refresh        | Task 3 (api.ts)                          |
| Tokens in memory (not localStorage) | Task 3 (auth.ts)                         |
| socket.io-client singleton          | Task 3 (socket.ts)                       |
| Login page                          | Task 6 (LoginPage.tsx)                   |
| Overview: stat cards                | Task 7                                   |
| Overview: device table              | Task 7                                   |
| Overview: live event feed           | Task 7                                   |
| Devices: table + status badges      | Task 8                                   |
| Devices: detail drawer              | Task 8                                   |
| Devices: unlock button              | Task 8                                   |
| Devices: register modal             | Task 8                                   |
| Users: table + sync health bar      | Task 9                                   |
| Users: per-device sync drawer       | Task 9                                   |
| Users: add user modal               | Task 9                                   |
| Users: terminate + resync           | Task 9                                   |
| Events: live WebSocket feed         | Task 10                                  |
| Events: history + filter            | Task 10                                  |
| Sync: queue depth cards             | Task 11                                  |
| Sync: failures table                | Task 11                                  |
| Sync: reconcile all button          | Task 11                                  |
| Vite proxy for /api and /ws         | Task 1 (vite.config.ts)                  |
| Error toast (success/error)         | Task 5 (Toast.tsx)                       |
| Confirm dialogs for destructive ops | Task 5 (ConfirmDialog.tsx)               |
| pnpm monorepo integration           | Tasks 1, 12                              |
