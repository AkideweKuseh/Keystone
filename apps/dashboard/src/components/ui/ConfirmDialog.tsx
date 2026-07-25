import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm',
  onConfirm, onCancel, danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[400px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          {danger && <AlertTriangle className="h-5 w-5 flex-shrink-0 text-rose-500" />}
          <h3 className="text-[15px] font-bold text-zinc-50">{title}</h3>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-zinc-400">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800/40 hover:text-zinc-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
              danger
                ? 'bg-rose-500 hover:bg-rose-600'
                : 'bg-gradient-to-r from-[#a855f7] to-[#6366f1] hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
