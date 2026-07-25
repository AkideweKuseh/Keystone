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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-card">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{q.name}</p>
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold tabular text-zinc-50">{q.waiting}</p>
          <p className="text-[10px] text-zinc-500">waiting</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular text-zinc-50">{q.active}</p>
          <p className="text-[10px] text-zinc-500">active</p>
        </div>
        {q.failed > 0 && (
          <div>
            <p className="text-2xl font-bold tabular text-rose-400">{q.failed}</p>
            <p className="text-[10px] text-zinc-500">failed</p>
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
    queryFn: () => api.get<SyncStatusResponse>('/sync/status').then(r => r.data),
    refetchInterval: 10_000,
  });

  const { data: failures } = useQuery<{ data: FailureRow[] }>({
    queryKey: ['sync-failures'],
    queryFn: () => api.get('/sync/failures').then(r => r.data),
    refetchInterval: 15_000,
  });

  const reconcile = useMutation({
    mutationFn: () => api.post('/sync/run', { scope: 'all' }),
    onSuccess: () => { toast('Reconciliation started for all devices', 'success'); void qc.invalidateQueries({ queryKey: ['sync-status'] }); },
    onError: () => toast('Failed to start reconciliation', 'error'),
  });

  const resyncRow = useMutation({
    mutationFn: (userId: string) => api.post(`/users/${userId}/resync`),
    onSuccess: () => { toast('Resync queued', 'success'); void qc.invalidateQueries({ queryKey: ['sync-failures'] }); },
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
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)] transition disabled:opacity-60"
          >
            {reconcile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reconcile All
          </button>
        }
      />

      <div className="flex-1 overflow-auto bg-ambient p-6">
        {/* Queue cards */}
        {syncData?.queues && syncData.queues.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {syncData.queues.map(q => <QueueCard key={q.name} q={q} />)}
          </div>
        )}

        {/* Failures table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-card">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-zinc-50">Sync Failures</h3>
              <p className="text-[12px] text-zinc-500">{failureList.length} items need attention</p>
            </div>
            {failureList.length > 0 && (
              <button
                onClick={() => failureList.forEach(f => resyncRow.mutate(f.userId))}
                className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800/40 hover:text-zinc-50"
              >
                Resync All Failed
              </button>
            )}
          </div>

          {failureList.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-emerald-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-xs">✓</span>
              No sync failures — all devices in sync
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['User', 'Device', 'Error', 'Retries', 'Last Attempt', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failureList.map((f, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-zinc-100">
                      {[f.user?.firstName, f.user?.lastName].filter(Boolean).join(' ') || f.user?.employeeNo || f.userId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400">{f.device?.name ?? f.deviceId.slice(0, 8)}</td>
                    <td className="px-5 py-3.5 max-w-[220px]">
                      <StatusBadge status="offline" />
                      {f.errorMessage && <p className="mt-1 truncate text-[11px] text-rose-400">{f.errorMessage}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400 tabular">{f.retryCount}</td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400">
                      {f.lastAttemptAt ? formatDistanceToNow(new Date(f.lastAttemptAt), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => resyncRow.mutate(f.userId)}
                        className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-brand-violet hover:text-brand-violet"
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
