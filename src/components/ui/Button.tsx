import { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'border-slate-900 bg-slate-900 text-white hover:bg-slate-700 dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300',
  ghost:
    'border-slate-200 bg-transparent text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  destructive:
    'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'rounded-md px-2 py-1 text-xs',
  md: 'rounded-lg px-3 py-2 text-sm',
  lg: 'rounded-lg px-4 py-2.5 text-sm',
};

export default function Button({ children, className, variant = 'ghost', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'border font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
