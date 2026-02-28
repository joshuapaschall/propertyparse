import { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeVariant =
  | 'neutral'
  | 'running'
  | 'done'
  | 'failed'
  | 'valid'
  | 'needs_review'
  | 'skipped'
  | 'duplicate'
  | 'out_of_scope';

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  running:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-300',
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300',
  needs_review:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300',
  skipped: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  duplicate: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-300',
  out_of_scope:
    'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-700/50 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
};

export function getBadgeVariant(value: string | null | undefined): BadgeVariant {
  const normalized = (value ?? '').toUpperCase();
  if (normalized.includes('FAIL')) return 'failed';
  if (normalized.includes('DONE') || normalized.includes('COMPLETE') || normalized.includes('SUCCESS')) return 'done';
  if (normalized.includes('RUN') || normalized.includes('PENDING') || normalized.includes('PROCESS')) return 'running';
  if (normalized === 'VALID') return 'valid';
  if (normalized === 'NEEDS_REVIEW') return 'needs_review';
  if (normalized === 'SKIPPED') return 'skipped';
  if (normalized === 'DUPLICATE') return 'duplicate';
  if (normalized.startsWith('OUT_OF_SCOPE')) return 'out_of_scope';
  return 'neutral';
}

export default function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', variantClasses[variant], className)}>
      {children}
    </span>
  );
}
