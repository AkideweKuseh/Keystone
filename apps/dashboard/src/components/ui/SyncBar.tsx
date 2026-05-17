// Mini horizontal sync health bar: green=synced, amber=pending, red=failed
interface SyncBarProps {
  synced: number;
  pending: number;
  failed: number;
}

export function SyncBar({ synced, pending, failed }: SyncBarProps) {
  const total = synced + pending + failed;
  if (total === 0) return <span className="text-xs text-zinc-600">—</span>;

  const pctSynced  = (synced  / total) * 100;
  const pctPending = (pending / total) * 100;
  const pctFailed  = (failed  / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
        {pctSynced  > 0 && <div className="bg-green-500" style={{ width: `${pctSynced}%` }} />}
        {pctPending > 0 && <div className="bg-amber-500" style={{ width: `${pctPending}%` }} />}
        {pctFailed  > 0 && <div className="bg-red-500"   style={{ width: `${pctFailed}%` }} />}
      </div>
      <span className="text-xs text-zinc-500">{synced}/{total}</span>
    </div>
  );
}
