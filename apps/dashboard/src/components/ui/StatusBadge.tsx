import { cn } from '@/lib/utils';

type Status = 'online' | 'offline' | 'degraded' | 'unknown' | 'disabled';

const config: Record<Status, { dot: string; text: string; bg: string }> = {
  online:   { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-500/10' },
  degraded: { dot: 'bg-amber-500',  text: 'text-amber-400',  bg: 'bg-amber-500/10' },
  offline:  { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/10'   },
  disabled: { dot: 'bg-zinc-600',   text: 'text-zinc-400',   bg: 'bg-zinc-500/10'  },
  unknown:  { dot: 'bg-zinc-600',   text: 'text-zinc-400',   bg: 'bg-zinc-500/10'  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status in config ? status : 'unknown') as Status;
  const { dot, text, bg } = config[s];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', bg, text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}
