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
    queryFn: () => api.get<Device[]>('/devices').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: eventsData } = useQuery<{ data: { id: string; eventTime: string; eventType: string; employeeNo?: string }[] }>({
    queryKey: ['events-today'],
    queryFn: () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      return api.get('/events', { params: { from: from.toISOString(), limit: 100 } }).then(r => r.data);
    },
    refetchInterval: 60_000,
  });

  const { data: syncFailures } = useQuery<{ data: unknown[] }>({
    queryKey: ['sync-failures'],
    queryFn: () => api.get('/sync/failures').then(r => r.data),
    refetchInterval: 30_000,
  });

  // WebSocket live feed
  useEffect(() => {
    const socket = socketRef.current;
    socket.on('event', (e: LiveEvent) => {
      setEvents(prev => [{ ...e, isNew: true }, ...prev].slice(0, 20));
      setTimeout(() => {
        setEvents(prev => prev.map(x => x.id === e.id ? { ...x, isNew: false } : x));
      }, 3000);
    });
    return () => { socket.off('event'); };
  }, []);

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const todayCount  = eventsData?.data?.length ?? 0;
  const failCount   = syncFailures?.data?.length ?? 0;
  const displayDevices = [...devices]
    .sort((a, b) => {
      const order: Record<string, number> = { online: 0, degraded: 1, unknown: 2, offline: 3, disabled: 4 };
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
                  {['Name', 'Status', 'Vendor', 'IP Address', 'Last Seen'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayDevices.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => navigate('/devices')}
                    className="cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors last:border-0"
                  >
                    <td className="px-5 py-3 text-[13px] font-semibold text-zinc-100">{d.name}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-[13px] capitalize text-zinc-500">{d.vendor}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-zinc-500">{d.ipAddress}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">{timeAgo(d.lastSeenAt)}</td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-zinc-600">
                      No devices registered yet.{' '}
                      <button onClick={() => navigate('/devices')} className="text-purple-400 hover:underline">
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
              {events.map(e => (
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
                    <p className="text-[11px] text-zinc-600">
                      {e.type.replace(/_/g, ' ')}
                    </p>
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
