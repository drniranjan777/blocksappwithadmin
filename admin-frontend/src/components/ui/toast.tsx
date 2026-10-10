'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const Context = createContext<ToastApi | null>(null);

/** Short confirmations at the bottom of the screen. Read aloud politely; errors stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t) }), [push]);

  return (
    <Context value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto max-w-md rounded-xl px-[18px] py-3 text-[13.5px] font-semibold text-white shadow-lg',
              t.kind === 'error' ? 'bg-bad' : 'bg-ink',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Context>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
