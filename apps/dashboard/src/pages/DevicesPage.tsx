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
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-600'}`}>
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
                onChange={e => setSearch(e.target.value)}
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
            <div className="flex items-center justify-center py-20 text-sm text-zinc-600">Loading…</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Status', 'Vendor', 'Model', 'IP Address', 'Last Seen', ''].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
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
                    className="cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors last:border-0"
                  >
                    <td className="px-5 py-3 text-[13px] font-semibold text-zinc-100">{d.name}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-[13px] capitalize text-zinc-400">{d.vendor}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">{d.model ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-zinc-500">{d.ipAddress}:{d.port}</td>
                    <td className="px-5 py-3 text-[13px] text-zinc-500">
                      {d.lastSeenAt ? formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true }) : 'Never'}
                    </td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
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
            <div><StatusBadge status={selected.status} /></div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Device Info</p>
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
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Capabilities</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="JSON API" active={selected.capabilities.supportsJson} />
                  <Chip label="Face" active={selected.capabilities.supportsFace} />
                  <Chip label="Fingerprint" active={selected.capabilities.supportsFp} />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                  {selected.capabilities.maxUsers != null && <span>Max users: {selected.capabilities.maxUsers.toLocaleString()}</span>}
                  {selected.capabilities.maxCards != null && <span>Max cards: {selected.capabilities.maxCards.toLocaleString()}</span>}
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
        onConfirm={() => { if (selected) disable.mutate(selected.id); setConfirmDisable(false); }}
        onCancel={() => setConfirmDisable(false)}
      />

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[460px] rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-5 text-[15px] font-semibold text-zinc-50">Register Device</h3>
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
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Vendor</label>
                <select
                  value={form.vendor}
                  onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="mock">Mock (local dev)</option>
                  <option value="hikvision">Hikvision</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowRegister(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 transition-colors">
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
