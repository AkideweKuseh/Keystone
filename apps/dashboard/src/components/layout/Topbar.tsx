import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  live?: boolean;
  actions?: ReactNode;
}

export function Topbar({ title, live = false, actions }: TopbarProps) {
  return (
    <header className="glass sticky top-0 z-20 flex h-[60px] flex-shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
      <h1 className="text-[17px] font-bold tracking-tight text-zinc-50">{title}</h1>
      {live && (
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          <span className="text-[11px] font-semibold text-emerald-400">Live</span>
        </div>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
