import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
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

const inputCls = 'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 transition focus:border-brand-violet focus:outline-none focus:ring-4 focus:ring-brand-violet/15';

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [form, setForm] = useState({ employeeNo: '', firstName: '', lastName: '', email: '' });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ['user-sync', selected?.id],
    queryFn: () => api.get<SyncStatus>(`/users/${selected!.id}/sync-status`).then(r => r.data),
    enabled: !!selected,
    refetchInterval: 10_000,
  });

  const resync = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/resync`),
    onSuccess: () => { toast('Resync queued for all devices', 'success'); void qc.invalidateQueries({ queryKey: ['user-sync', selected?.id] }); },
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

  const filtered = users.filter(u =>
    [u.employeeNo, u.firstName, u.lastName, u.email].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Close the add-user modal on Escape
  useEffect(() => {
    if (!showAdd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAdd(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdd]);

  function getSyncSummary(_userId: string) {
    return { synced: 0, pending: 0, failed: 0 };
  }

  const syncDevices = syncStatus?.devices ?? [];
  const syncSynced  = syncDevices.filter(d => (d.syncStatus ?? d.sync_status) === 'synced').length;
  const syncPending = syncDevices.filter(d => ['pending', 'in_progress'].includes(d.syncStatus ?? d.sync_status ?? '')).length;
  const syncFailed  = syncDevices.filter(d => (d.syncStatus ?? d.sync_status) === 'failed').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Users"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-48 rounded-xl border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 transition focus:border-brand-violet focus:outline-none focus:ring-4 focus:ring-brand-violet/15"
              />
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)]"
            >
              <Plus className="h-3.5 w-3.5" /> Add User
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto bg-ambient p-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-zinc-500">Loading…</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Employee No', 'Name', 'Email', 'Status', 'Sync Health'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const { synced, pending, failed } = getSyncSummary(u.id);
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u)}
                      className="cursor-pointer border-b border-zinc-800/50 transition-colors last:border-0 hover:bg-zinc-800/40"
                    >
                      <td className="px-5 py-3 font-mono text-[12px] text-zinc-400">{u.employeeNo}</td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-zinc-50">
                        {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-zinc-400">{u.email ?? '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-5 py-3"><SyncBar synced={synced} pending={pending} failed={failed} /></td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-500">
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
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={[selected?.firstName, selected?.lastName].filter(Boolean).join(' ') || selected?.employeeNo || ''}>
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <StatusBadge status={selected.status} />
              <span className="font-mono text-xs text-zinc-400">{selected.employeeNo}</span>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Sync Status</p>
                <span className="text-xs text-zinc-400">{syncSynced}/{syncDevices.length} synced</span>
              </div>
              <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 p-2">
                {syncDevices.length === 0 && (
                  <p className="py-3 text-center text-xs text-zinc-500">No devices assigned</p>
                )}
                {syncDevices.map(d => {
                  const status = d.syncStatus ?? d.sync_status ?? 'unknown';
                  return (
                    <div key={d.device_id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                      <StatusBadge status={status === 'synced' ? 'online' : status === 'failed' ? 'offline' : 'degraded'} />
                      <span className="flex-1 text-xs text-zinc-300">{d.name ?? d.device_id.slice(0, 8)}</span>
                      {(d.errorMessage ?? d.error_message) && <span className="max-w-[120px] truncate text-[10px] text-rose-400">{d.errorMessage ?? d.error_message}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => resync.mutate(selected.id)}
                disabled={resync.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                {resync.isPending ? 'Queuing…' : 'Resync All Devices'}
              </button>
              {selected.status !== 'terminated' && (
                <button
                  onClick={() => setConfirmTerminate(true)}
                  className="mt-2 flex items-center justify-center rounded-xl border border-rose-500/20 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-rose-500/10"
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
        onConfirm={() => { if (selected) terminate.mutate(selected.id); setConfirmTerminate(false); }}
        onCancel={() => setConfirmTerminate(false)}
      />

      {/* Add user modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-[420px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-zinc-50">Add User</h3>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {([
                { label: 'Employee No *', key: 'employeeNo', placeholder: 'EMP00123' },
                { label: 'First Name', key: 'firstName', placeholder: 'Ada' },
                { label: 'Last Name', key: 'lastName', placeholder: 'Lovelace' },
                { label: 'Email', key: 'email', placeholder: 'ada@example.com' },
              ] as const).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
                  <input
                    value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800/40 hover:text-zinc-50">Cancel</button>
              <button
                onClick={() => addUser.mutate()}
                disabled={addUser.isPending || !form.employeeNo}
                className="rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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
