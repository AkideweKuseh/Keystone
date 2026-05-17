import { cn } from '@/lib/utils';

const eventColors: Record<string, string> = {
  access_granted: 'bg-green-500 shadow-green-500/50',
  access_denied:  'bg-red-500 shadow-red-500/50',
  tamper:         'bg-amber-500 shadow-amber-500/50',
  door_opened:    'bg-blue-500 shadow-blue-500/50',
  door_closed:    'bg-zinc-500 shadow-zinc-500/50',
  forced_entry:   'bg-red-600 shadow-red-600/50',
  device_offline: 'bg-zinc-500 shadow-zinc-500/50',
  device_online:  'bg-green-500 shadow-green-500/50',
};

export function EventDot({ type }: { type: string }) {
  const color = eventColors[type] ?? 'bg-zinc-500 shadow-zinc-500/50';
  return <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full shadow-[0_0_6px]', color)} />;
}
