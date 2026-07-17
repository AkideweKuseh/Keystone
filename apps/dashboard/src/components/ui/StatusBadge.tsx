import { cn } from '@/lib/utils';

type Status = 'online' | 'offline' | 'degraded' | 'unknown' | 'disabled';

const config: Record<Status, { dot: string; text: string; bg: string }> = {
  online:   { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  degraded: { dot: 'bg-amber-500',   text: 'text-amber-400',   bg: 'bg-amber-500/10'   },
  offline:  { dot: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-500/10'    },
  disabled: { dot: 'bg-zinc-600',   text: 'text-zinc-300',   bg: 'bg-zinc-800'  },
  unknown:  { dot: 'bg-zinc-600',   text: 'text-zinc-300',   bg: 'bg-zinc-800'  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status in config ? status : 'unknown') as Status;
  const { dot, text, bg } = config[s];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', bg, text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {s}
    </span>
  );
}
