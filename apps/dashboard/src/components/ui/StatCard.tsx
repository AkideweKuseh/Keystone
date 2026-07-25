import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { AreaSparkline } from './AreaSparkline';

type Accent = 'coral' | 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo';

const ACCENT: Record<Accent, { wrap: string; spark: string }> = {
  coral:   { wrap: 'bg-brand-violet/10 text-brand-violet',          spark: '#a855f7' },
  emerald: { wrap: 'bg-emerald-500/10 text-emerald-400',              spark: '#10b981' },
  amber:   { wrap: 'bg-amber-500/10 text-amber-400',                  spark: '#f59e0b' },
  rose:    { wrap: 'bg-rose-500/10 text-rose-400',                    spark: '#f43f5e' },
  slate:   { wrap: 'bg-zinc-800 text-zinc-400',                 spark: '#94a3b8' },
  indigo:  { wrap: 'bg-indigo-50 text-indigo-600',                spark: '#6366f1' },
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: ReactNode;
  valueColor?: string;
  icon?: ReactNode;
  accent?: Accent;
  spark?: number[];
}

export function StatCard({ label, value, sub, valueColor, icon, accent = 'coral', spark }: StatCardProps) {
  const a = ACCENT[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-400">{label}</p>
          <p className={cn('mt-1.5 text-[26px] font-bold leading-none tracking-tight text-zinc-50 tabular', valueColor)}>
            {value}
          </p>
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5', a.wrap)}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium">{sub}</div>
        {spark && spark.length > 1 && (
          <AreaSparkline data={spark} color={a.spark} width={88} height={32} />
        )}
      </div>
    </div>
  );
}
