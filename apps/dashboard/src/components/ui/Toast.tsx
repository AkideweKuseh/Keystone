import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastId = 0;
let globalPush: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  globalPush?.({ message, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    globalPush = push;
    return () => { globalPush = null; };
  }, [push]);

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in',
            t.type === 'success'
              ? 'border-green-800 bg-green-950 text-green-300'
              : 'border-red-800 bg-red-950 text-red-300',
          )}
        >
          {t.type === 'success'
            ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
            : <XCircle className="h-4 w-4 flex-shrink-0" />}
          {t.message}
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
