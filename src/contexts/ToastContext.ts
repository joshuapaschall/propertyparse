import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

export type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return ctx;
}
