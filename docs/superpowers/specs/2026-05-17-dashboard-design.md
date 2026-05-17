# Smart Access Dashboard — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

A professional admin dashboard for the Smart Access Middleware Platform. Single-page React application that connects directly to the existing NestJS API (localhost:3000) and WebSocket (ws://localhost:3000/ws). No backend changes required.

---

## Visual Identity

| Property | Value                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Font     | Inter (Google Fonts) — 400/500/600/700 weights                                           |
| Theme    | Midnight Dark — true black (`#09090b`), zinc cards (`#18181b`), zinc borders (`#27272a`) |
| Accent   | Purple (`#a855f7`) — active nav, live dots, primary buttons, NEW badges                  |
| Success  | Green (`#22c55e`) — access granted, online status                                        |
| Warning  | Amber (`#f59e0b`) — degraded status, pending sync                                        |
| Danger   | Red (`#ef4444`) — denied, offline, failures                                              |
| Logo     | 🔥 emoji + "Smart Access" in Inter 700                                                   |

---

## Tech Stack

| Layer         | Choice                 | Reason                                                    |
| ------------- | ---------------------- | --------------------------------------------------------- |
| Framework     | React 18 + Vite        | Fastest dev setup, no SSR needed                          |
| Styling       | Tailwind CSS v3        | Utility-first, matches design system exactly              |
| UI components | shadcn/ui (dark theme) | Pre-built accessible components, Midnight Dark compatible |
| Routing       | React Router v6        | Simple client-side routing for 5 pages                    |
| HTTP client   | axios                  | Intercept JWT, handle 401 refresh                         |
| WebSocket     | socket.io-client       | Matches server implementation                             |
| State         | React Query (TanStack) | Server state caching + polling                            |
| Icons         | Lucide React           | Consistent SVG icon set                                   |
| Location      | `apps/dashboard/`      | In the existing pnpm monorepo                             |

---

## Architecture

```
apps/dashboard/
├── src/
│   ├── main.tsx                 # React root, router
│   ├── lib/
│   │   ├── api.ts               # axios instance with JWT interceptor
│   │   ├── socket.ts            # socket.io-client singleton
│   │   └── auth.ts              # token storage (memory + sessionStorage)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # Full sidebar nav with badges + live dot
│   │   │   └── Topbar.tsx       # Page title + live indicator + action buttons
│   │   └── ui/                  # shadcn/ui re-exports + custom atoms
│   │       ├── StatusBadge.tsx  # Online / Offline / Degraded pill
│   │       ├── EventDot.tsx     # Colour-coded event dot (granted/denied/tamper)
│   │       └── StatCard.tsx     # Metric card with label, value, sub-stat
│   └── pages/
│       ├── LoginPage.tsx
│       ├── OverviewPage.tsx
│       ├── DevicesPage.tsx
│       ├── UsersPage.tsx
│       ├── EventsPage.tsx
│       └── SyncPage.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Authentication

- Login page (`/login`): email + password form, calls `POST /api/v1/auth/login`.
- Tokens stored in memory (`lib/auth.ts`). `access_token` used as Bearer on every request.
- axios interceptor: on 401, calls `POST /api/v1/auth/refresh` with stored `refresh_token`, retries original request once. On second 401, redirects to `/login`.
- All routes except `/login` are protected — redirect to `/login` if no token in memory.
- Logout: calls `POST /api/v1/auth/logout`, clears tokens, navigates to `/login`.

---

## Pages

### 1. Login (`/login`)

- Centred card on full-page dark background.
- 🔥 logo + "Smart Access" heading.
- Email + password fields (Inter, proper labels).
- "Sign in" primary button. Disabled + spinner while loading.
- Error state: red inline message below button ("Invalid credentials" / "Account locked").
- No "forgot password" — out of scope.

### 2. Overview (`/`)

**Topbar:** "Overview" title · Live indicator · "Register Device" ghost button · "Add User" primary button.

**Stat cards (4-column grid):**
| Card | Value | Sub-stat |
|------|-------|---------|
| Devices Online | count of `status=online` | "of N total" |
| Users Synced | count of `syncStatus=synced` | "N pending" in amber if > 0 |
| Events Today | event count last 24h | "↑ N% vs yesterday" in green |
| Sync Failures | count of `syncStatus=failed` | "need attention" in red if > 0 |

Stats polled every 30s via React Query.

**Device table** (left, ~60% width):

- Columns: Name, Status badge, Vendor, IP Address, Last Seen.
- Sorted by status (online first), then last seen.
- Click row → `DevicesPage` with that device pre-selected (slide-in drawer).
- Shows top 5 devices on overview; "View all →" link to full page.

**Live Events feed** (right, 340px):

- WebSocket subscription via `socket.io-client`.
- Events appear at top with "NEW" purple badge for 3 seconds, then fade.
- Each event: coloured dot · Name or employeeNo · Device + event type · time-ago.
- Max 20 items shown; overflow scrolls.
- Reconnect indicator if WebSocket drops.

---

### 3. Devices (`/devices`)

**Topbar:** "Devices" title · device count badge · search input · "Register Device" primary button.

**Table (full page):**

- Columns: Name, Status, Vendor, Model, IP, Last Seen, Actions.
- Status column: coloured badge.
- Actions column: "Unlock" button (door icon) inline for `status=online` devices.
- Click anywhere on row → slide-in **Detail Drawer** (right side, 420px):
  - Device name + status badge at top.
  - Info grid: IP, port, vendor, model, firmware, serial.
  - Capabilities section: JSON/Face/Fingerprint support chips, max users/cards.
  - "Unlock Door" button (calls `POST /devices/:id/unlock`, shows success/error toast).
  - "Force Health Check" button.
  - "Edit" button → inline form to update name, username, password.
  - "Disable Device" danger button (soft delete, confirms first).

**Register Device modal** (triggered by topbar button):

- Fields: Name, Vendor (dropdown: hikvision/mock), IP Address, Port (default 80), Username, Password.
- Submits `POST /api/v1/devices`.
- On success: closes modal, refreshes table, shows success toast.

---

### 4. Users (`/users`)

**Topbar:** "Users" title · user count badge · search input · "Add User" primary button.

**Table (full page):**

- Columns: Employee No, Name, Email, Status, Sync Health, Updated.
- Sync Health column: mini progress bar — green segment for synced devices, amber for pending, red for failed. Shows fraction e.g. "6/8 synced".
- Click row → slide-in **Detail Drawer**:
  - User name + employee no + status badge.
  - Per-device sync table: Device name | Sync status badge | Last synced | Error message.
  - "Resync All" button (calls `POST /users/:id/resync`, shows loading state).
  - "Terminate User" danger button (calls `DELETE /users/:id`, confirms first).

**Add User modal:**

- Fields: Employee No, First Name, Last Name, Email (optional), Phone (optional), Valid From/To (date pickers, optional).
- Submits `POST /api/v1/users`.
- On success: closes modal, refreshes table, shows "User created — syncing to N devices" toast.

---

### 5. Events (`/events`)

**Topbar:** "Events" title · live indicator · filter controls.

**Layout: split view**

Left panel (live feed, ~half width):

- WebSocket stream, newest on top.
- Each row: coloured dot · timestamp · employee name/no · device name · event type.
- Auto-scrolls to top on new event unless user has manually scrolled.
- "Paused" indicator if user scrolls up.

Right panel (search & history):

- Filter bar: Event type dropdown (granted/denied/tamper/all), Device dropdown, Date range picker.
- Paginated table from `GET /api/v1/events`.
- Cursor-based pagination — "Load more" button at bottom.
- Click row → expand inline to show raw payload (collapsed JSON).

---

### 6. Sync (`/sync`)

**Topbar:** "Sync Health" title · "Reconcile All" primary button.

**Queue depth cards (row of 3):**

- user-sync: waiting / active / failed counts.
- health-check: waiting / active.
- event-process: waiting / active.
  Data from `GET /api/v1/sync/status`. Polled every 10s.

**Failures table:**

- Failed `device_user_sync` rows from `GET /api/v1/sync/failures`.
- Columns: User, Device, Error, Retry Count, Last Attempt.
- "Resync" button per row.
- "Resync All Failed" bulk button in table header.

**Reconcile All button:**

- Calls `POST /api/v1/sync/run { "scope": "all" }`.
- Shows loading spinner, success toast when complete.

---

## Error Handling

- API errors → toast notification (top-right, auto-dismiss 4s). Error message from Problem+JSON `title` field.
- Network offline → persistent banner "Disconnected — retrying…" at top.
- WebSocket disconnect → "Live updates paused" indicator in topbar, auto-reconnects.
- 401 from any API call → silent token refresh, retry once. Second 401 → logout.
- Form validation: inline under each field, validated on blur and submit.

---

## Responsiveness

Minimum supported width: 1280px (desktop only — this is an ops tool, not a mobile app). No responsive breakpoints required.

---

## API Proxy

Vite dev server proxies `/api` → `http://localhost:3000` and `/ws` → `ws://localhost:3000`. No CORS issues in development. Production deployment uses Nginx (already configured in `infra/nginx/nginx.dev.conf`).

---

## Not in scope

- Multi-tenant switching (Phase 5)
- User credential management (card add/remove) beyond what's shown in drawer
- Audit log viewer
- Settings page
- Dark/light theme toggle (Midnight Dark only)
- Mobile / tablet layout
