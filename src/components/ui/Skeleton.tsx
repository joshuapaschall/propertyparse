import clsx from 'clsx';

type SkeletonProps = {
  className?: string;
};

export default function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx('animate-pulse rounded bg-slate-200 dark:bg-slate-800', className)} />;
}
