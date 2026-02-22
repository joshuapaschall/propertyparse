import { ReactNode } from 'react';
import clsx from 'clsx';
import Button from './Button';

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  icon?: ReactNode;
  hint?: string;
};

export default function EmptyState({ title, description, actionLabel, onAction, className, icon, hint }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {icon ? <div className="mb-3 flex justify-center">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-4" variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
