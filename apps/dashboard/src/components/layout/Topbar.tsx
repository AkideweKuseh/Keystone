import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  live?: boolean;
  actions?: ReactNode;
}

export function Topbar({ title, live = false, actions }: TopbarProps) {
  return (
    <header className="flex h-[54px] flex-shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
      <h1 className="text-[16px] font-bold tracking-tight text-zinc-50">{title}</h1>
      {live && (
        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
          <span className="text-[12px] font-medium text-zinc-500">Live</span>
        </div>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
