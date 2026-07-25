import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Unlock, Plus, RefreshCw, Search, X, Loader2 } from 'lucide-react';
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
    <div className="flex justify-between border-b border-zinc-800 py-2 last:border-0">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="font-mono text-xs text-zinc-200">{value ?? '—'}</span>
    </div>
  );
}

function Chip({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
      {label}
    </span>
  );
}

const inputCls = 'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 transition focus:border-brand-violet focus:outline-none focus:ring-4 focus:ring-brand-violet/15';

export function DevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Device | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const [form, setForm] = useState({ name: '', vendor: 'mock', ipAddress: '127.0.0.1', port: '80', username: 'admin', password: '' });

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices').then(r => r.data),
    refetchInterval: 30_000,
  });

  const unlock = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/unlock`, { door_index: 1 }),
    onSuccess: () => toast('Door unlocked', 'success'),
    onError: () => toast('Unlock failed — check device is online', 'error'),
  });

  const healthCheck = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/health-check`),
    onSuccess: () => { toast('Health check queued', 'success'); void qc.invalidateQueries({ queryKey: ['devices'] }); },
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
      setForm({ name: '', vendor: 'mock', ipAddress: '127.0.0.1', port: '80', username: 'admin', password: '' });
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: () => toast('Registration failed — check IP and credentials', 'error'),
  });

  const filtered = devices.filter(d =>
    [d.name, d.ipAddress, d.vendor, d.model].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Close the register modal on Escape
  useEffect(() => {
    if (!showRegister) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowRegister(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRegister]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar
        title="Devices"
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
              onClick={() => setShowRegister(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)]"
            >
              <Plus className="h-3.5 w-3.5" /> Register Device
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
                  {['Name', 'Status', 'Vendor', 'Model', 'IP Address', 'Last Seen', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="cursor-pointer border-b border-zinc-800/50 transition-colors last:border-0 hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-zinc-50">{d.name}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3.5 text-[13px] capitalize text-zinc-400">{d.vendor}</td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400">{d.model ?? '—'}</td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-zinc-400">{d.ipAddress}:{d.port}</td>
                    <td className="px-5 py-3.5 text-[13px] text-zinc-400">
                      {d.lastSeenAt ? formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true }) : 'Never'}
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {d.status === 'online' && (
                        <button
                          onClick={() => unlock.mutate(d.id)}
                          disabled={unlock.isPending}
                          className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-brand-violet hover:text-brand-violet disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {unlock.isPending && unlock.variables === d.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Unlocking…
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" /> Unlock
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-zinc-500">
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
            <div><StatusBadge status={selected.status} /></div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Device Info</p>
              <div className="rounded-xl border border-zinc-800 px-3">
                <InfoRow label="IP Address" value={`${selected.ipAddress}:${selected.port}`} />
                <InfoRow label="Vendor" value={selected.vendor} />
                <InfoRow label="Model" value={selected.model} />
                <InfoRow label="Firmware" value={selected.firmwareVersion} />
                <InfoRow label="Serial" value={selected.serialNumber} />
              </div>
            </div>

            {selected.capabilities && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Capabilities</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="JSON API" active={selected.capabilities.supportsJson} />
                  <Chip label="Face" active={selected.capabilities.supportsFace} />
                  <Chip label="Fingerprint" active={selected.capabilities.supportsFp} />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-zinc-400">
                  {selected.capabilities.maxUsers != null && <span>Max users: {selected.capabilities.maxUsers.toLocaleString()}</span>}
                  {selected.capabilities.maxCards != null && <span>Max cards: {selected.capabilities.maxCards.toLocaleString()}</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                disabled={selected.status !== 'online' || unlock.isPending}
                onClick={() => unlock.mutate(selected.id)}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] py-2.5 text-sm font-semibold text-white shadow-glow transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {unlock.isPending && unlock.variables === selected.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Unlocking…
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" /> Unlock Door
                  </>
                )}
              </button>
              <button
                onClick={() => healthCheck.mutate(selected.id)}
                disabled={healthCheck.isPending}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {healthCheck.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" /> Force Health Check
                  </>
                )}
              </button>
              <button
                onClick={() => setConfirmDisable(true)}
                disabled={disable.isPending}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disable.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Disabling…
                  </>
                ) : (
                  'Disable Device'
                )}
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDisable}
        title="Disable this device?"
        description={`"${selected?.name}" will be set to disabled. All sync jobs will stop. You can re-enable it later by updating the status.`}
        confirmLabel="Disable"
        danger
        onConfirm={() => { if (selected) disable.mutate(selected.id); setConfirmDisable(false); }}
        onCancel={() => setConfirmDisable(false)}
      />

      {/* Register modal */}
      {showRegister && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowRegister(false)}
        >
          <div
            className="w-[460px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-zinc-50">Register Device</h3>
              <button
                onClick={() => setShowRegister(false)}
                className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {([
                { label: 'Name', key: 'name', placeholder: 'HQ Lobby Reader', type: 'text' },
                { label: 'IP Address', key: 'ipAddress', placeholder: '10.10.0.21', type: 'text' },
                { label: 'Port', key: 'port', placeholder: '80', type: 'text' },
                { label: 'Username', key: 'username', placeholder: 'admin', type: 'text' },
                { label: 'Password', key: 'password', placeholder: '••••••••', type: 'password' },
              ] as const).map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
                  <input
                    type={type ?? 'text'}
                    value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={inputCls}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Vendor</label>
                <select
                  value={form.vendor}
                  onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))}
                  className={inputCls}
                >
                  <option value="mock">Mock (local dev)</option>
                  <option value="hikvision">Hikvision</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowRegister(false)} className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800/40 hover:text-zinc-50">
                Cancel
              </button>
              <button
                onClick={() => register.mutate()}
                disabled={register.isPending || !form.name || !form.password}
                className="rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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
