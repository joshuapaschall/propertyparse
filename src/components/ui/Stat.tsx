import { ReactNode } from 'react';

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: 'primary' | 'default' | 'muted';
  className?: string;
};

export default function Stat({ label, value, hint, variant = 'default', className = '' }: StatProps) {
  const variantClasses =
    variant === 'primary'
      ? 'border-t-2 border-t-indigo-500'
      : variant === 'muted'
        ? 'bg-slate-50 p-3 dark:bg-slate-900/80'
        : '';

  return (
    <div
      data-testid={variant === 'primary' ? 'stat-primary' : undefined}
      className={`rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${variant === 'muted' ? '' : 'p-4'} ${variantClasses} ${className}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 font-semibold ${variant === 'primary' ? 'text-3xl text-indigo-600 dark:text-indigo-400' : variant === 'muted' ? 'text-lg text-slate-900 dark:text-slate-100' : 'text-2xl text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}
