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

const EVENT_TYPES = ['all', 'access_granted', 'access_denied', 'tamper', 'door_opened', 'forced_entry'];

export function EventsPage() {
  const [liveEvents, setLiveEvents]   = useState<LiveEvent[]>([]);
  const [paused, setPaused]           = useState(false);
  const [typeFilter, setTypeFilter]   = useState('all');
  const [cursor, setCursor]           = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(connectSocket());

  const { data: historyData, isFetching, refetch } = useQuery<{ data: ApiEvent[]; next_cursor: string | null }>({
    queryKey: ['events', typeFilter, cursor],
    queryFn: () => api.get('/events', {
      params: {
        limit: 40,
        ...(typeFilter !== 'all' ? { event_type: typeFilter } : {}),
        ...(cursor ? { cursor } : {}),
      },
    }).then(r => r.data),
    staleTime: 10_000,
  });

  // Live WebSocket feed
  useEffect(() => {
    const socket = socketRef.current;
    socket.on('event', (e: ApiEvent) => {
      if (!paused) {
        setLiveEvents(prev => [{ ...e, isNew: true }, ...prev].slice(0, 50));
        setTimeout(() => setLiveEvents(prev => prev.map(x => x.id === e.id ? { ...x, isNew: false } : x)), 3000);
      }
    });
    return () => { socket.off('event'); };
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
            onChange={e => { setTypeFilter(e.target.value); setCursor(null); void refetch(); }}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-purple-500 focus:outline-none"
          >
            {EVENT_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All events' : t.replace(/_/g, ' ')}</option>
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
                onClick={() => { setPaused(false); feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <ChevronDown className="h-3 w-3" /> Resume
              </button>
            )}
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
            {liveEvents.map(e => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <EventDot type={e.eventType} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-100">
                    {e.employeeNo ?? 'Unknown'}
                    {e.isNew && (
                      <span className="ml-1.5 rounded bg-purple-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-400">new</span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">{e.eventType.replace(/_/g, ' ')} · {format(new Date(e.eventTime), 'HH:mm:ss')}</p>
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
            <span className="ml-2 text-xs text-zinc-500">{typeFilter !== 'all' ? `· ${typeFilter.replace(/_/g, ' ')}` : ''}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
            {historyData?.data.map(e => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <EventDot type={e.eventType} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-100">{e.employeeNo ?? 'Unknown'}</p>
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
