import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: ReactNode;
  valueColor?: string;
}

export function StatCard({ label, value, sub, valueColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={cn('text-3xl font-bold tracking-tight text-zinc-50', valueColor)}>
        {value}
      </p>
      {sub && <div className="mt-2 flex items-center gap-1 text-[11px] font-medium">{sub}</div>}
    </div>
  );
}
