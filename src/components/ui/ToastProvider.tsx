import { ReactNode, useCallback, useMemo, useState } from 'react';
import { ToastContext } from '../../contexts/ToastContext';
import type { ToastContextValue, ToastInput, ToastVariant } from '../../contexts/ToastContext';

type ToastItem = ToastInput & {
  id: string;
  variant: ToastVariant;
};

const TOAST_DURATION_MS = 3500;

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/80 dark:text-emerald-200',
  error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/80 dark:text-rose-200',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/80 dark:text-indigo-200',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, variant = 'info' }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, TOAST_DURATION_MS);
    },
    [dismissToast],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg transition duration-200 ease-out animate-in slide-in-from-top-2 ${variantStyles[toast.variant]}`}
            role="status"
          >
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.description ? <p className="mt-1 text-xs opacity-90">{toast.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
