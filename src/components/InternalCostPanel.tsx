import Card from './ui/Card';

type CostValue = string | number | null | undefined;

export type CostPanelItem = {
  label: string;
  value: CostValue;
};

type InternalCostPanelProps = {
  title?: string;
  subtitle?: string;
  items: CostPanelItem[];
  isPrivileged: boolean;
};

const isEmpty = (value: CostValue) => value === null || value === undefined || value === '';

export default function InternalCostPanel({
  title = 'Cost transparency',
  subtitle,
  items,
  isPrivileged,
}: InternalCostPanelProps) {
  const visibleItems = items.filter((item) => !isEmpty(item.value));
  if (!visibleItems.length) return null;

  return (
    <Card className="p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {isPrivileged
          ? 'Internal estimate for testing and reconciliation.'
          : 'Product-safe estimate for this job.'}
      </p>
    </Card>
  );
}
