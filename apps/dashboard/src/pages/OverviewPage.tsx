import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, AlertTriangle, Monitor, Zap, Cpu, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EventDot } from '@/components/ui/EventDot';
import { DonutChart, type DonutSegment } from '@/components/ui/DonutChart';
import { AreaSparkline } from '@/components/ui/AreaSparkline';
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

const STATUS_COLORS: Record<string, string> = {
  online: '#10b981',
  degraded: '#f59e0b',
  offline: '#f43f5e',
  disabled: '#94a3b8',
  unknown: '#94a3b8',
};

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

  // Events-per-hour buckets for the area chart (today)
  const hourly = useMemo(() => {
    const buckets = new Array(24).fill(0);
    eventsData?.data?.forEach(e => {
      const h = new Date(e.eventTime).getHours();
      if (h >= 0 && h < 24) buckets[h]++;
    });
    return buckets;
  }, [eventsData]);
  const currentHour = new Date().getHours();
  const last12 = hourly.slice(Math.max(0, currentHour - 11), currentHour + 1);
  const peakHour = hourly.indexOf(Math.max(...hourly));

  // Device status distribution for the donut
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach(d => { counts[d.status] = (counts[d.status] ?? 0) + 1; });
    return counts;
  }, [devices]);

  const donutSegments: DonutSegment[] = [
    { label: 'Online',   value: statusCounts.online ?? 0,   color: STATUS_COLORS.online },
    { label: 'Degraded', value: statusCounts.degraded ?? 0, color: STATUS_COLORS.degraded },
    { label: 'Offline',  value: statusCounts.offline ?? 0,  color: STATUS_COLORS.offline },
    { label: 'Other',    value: (statusCounts.disabled ?? 0) + (statusCounts.unknown ?? 0), color: STATUS_COLORS.unknown },
  ];

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
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-zinc-300 shadow-card transition-colors hover:bg-zinc-800/40 hover:text-zinc-50"
            >
              Register Device
            </button>
            <button
              onClick={() => navigate('/users')}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)] transition-shadow hover:shadow-[0_10px_26px_-8px_rgba(168,85,247,0.85)]"
            >
              Add User
            </button>
          </>
        }
      />

      <div className="flex-1 space-y-5 overflow-y-auto bg-ambient p-6">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Devices Online"
            value={`${onlineCount} / ${devices.length}`}
            icon={<Monitor />}
            accent="emerald"
            sub={
              <span className="text-zinc-500">
                {onlineCount === devices.length && devices.length > 0 ? 'All healthy' : `${devices.length - onlineCount} needing attention`}
              </span>
            }
          />
          <StatCard
            label="Events Today"
            value={todayCount.toLocaleString()}
            icon={<Zap />}
            accent="coral"
            spark={last12}
            sub={<span className="text-zinc-500">last 12h</span>}
          />
          <StatCard
            label="Sync Failures"
            value={failCount}
            icon={<AlertTriangle />}
            accent={failCount > 0 ? 'rose' : 'slate'}
            valueColor={failCount > 0 ? 'text-rose-400' : undefined}
            sub={
              failCount > 0 ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertTriangle className="h-3 w-3" /> needs attention
                </span>
              ) : (
                <span className="text-zinc-500">all clear</span>
              )
            }
          />
          <StatCard
            label="Total Devices"
            value={devices.length}
            icon={<Cpu />}
            accent="indigo"
            sub={<span className="text-zinc-500">registered</span>}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* Device status donut */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-zinc-50">Device Status</h3>
                <p className="text-[12px] text-zinc-500">Distribution across fleet</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <DonutChart
                segments={donutSegments}
                size={150}
                centerValue={onlineCount}
                centerLabel="online"
              />
              <ul className="flex-1 space-y-2.5">
                {donutSegments.map(seg => (
                  <li key={seg.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="flex-1 text-zinc-400">{seg.label}</span>
                    <span className="font-semibold text-zinc-50 tabular">{seg.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Events over time */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-zinc-50">Events Over Time</h3>
                <p className="text-[12px] text-zinc-500">Access events per hour, today</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-brand-violet/10 px-2.5 py-1 text-[12px] font-semibold text-brand-violet">
                <TrendingUp className="h-3.5 w-3.5" />
                peak {peakHour.toString().padStart(2, '0')}:00
              </div>
            </div>
            {hourly.some(h => h > 0) ? (
              <>
                <AreaSparkline
                  data={hourly}
                  color="#a855f7"
                  width={640}
                  height={160}
                  className="h-36 w-full"
                />
                <div className="mt-2 flex justify-between text-[10px] font-medium text-zinc-500">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>now</span>
                </div>
              </>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
                No events yet today.
              </div>
            )}
          </div>
        </div>

        {/* Bottom split */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          {/* Device table */}
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-card">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h3 className="text-[15px] font-bold text-zinc-50">Devices</h3>
              <button
                onClick={() => navigate('/devices')}
                className="flex items-center gap-1 text-[13px] font-medium text-brand-violet hover:text-brand-fuchsia"
              >
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Status', 'Vendor', 'IP Address', 'Last Seen'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
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
                    className="cursor-pointer border-b border-zinc-800/50 transition-colors last:border-0 hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-zinc-50">{d.name}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3.5 text-[13px] capitalize text-zinc-400">{d.vendor}</td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-zinc-400">{d.ipAddress}</td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400">{timeAgo(d.lastSeenAt)}</td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-500">
                      No devices registered yet.{' '}
                      <button onClick={() => navigate('/devices')} className="font-semibold text-brand-violet hover:underline">
                        Register one →
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Live event feed */}
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-card">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
              <span className="h-2 w-2 rounded-full bg-brand-violet shadow-[0_0_8px_#a855f7]" />
              <h3 className="text-[15px] font-bold text-zinc-50">Live Events</h3>
            </div>
            <div className="flex flex-col divide-y divide-zinc-800/50">
              {events.map(e => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <EventDot type={e.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-100">
                      {e.employeeNo ?? 'Unknown'}
                      {e.isNew && (
                        <span className="ml-1.5 rounded bg-brand-violet/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-violet">
                          new
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {e.type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] tabular text-zinc-500">
                    {timeAgo(e.eventTime)}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
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
