import Card from './ui/Card';

type CostValue = string | number | null | undefined;

export type CostPanelItem = {
  label: string;
  value: CostValue;
};

export type CostPanelSection = {
  title: string;
  items: CostPanelItem[];
  metadata?: string[];
};

type InternalCostPanelProps = {
  title?: string;
  subtitle?: string;
  items?: CostPanelItem[];
  sections?: CostPanelSection[];
  isPrivileged: boolean;
};

const isEmpty = (value: CostValue) => value === null || value === undefined || value === '';

export default function InternalCostPanel({
  title = 'Cost transparency',
  subtitle,
  items = [],
  sections,
  isPrivileged,
}: InternalCostPanelProps) {
  const visibleSections = (sections ?? [{ title: '', items }])
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isEmpty(item.value)),
      metadata: (section.metadata ?? []).filter((item) => item.trim().length > 0),
    }))
    .filter((section) => section.items.length > 0 || (section.metadata?.length ?? 0) > 0);

  if (!visibleSections.length) return null;

  return (
    <Card className="p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="mt-4 space-y-5">
        {visibleSections.map((section) => (
          <div key={section.title || 'default'} className="space-y-3">
            {section.title ? (
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {section.title}
              </h4>
            ) : null}
            {section.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => (
                  <div key={`${section.title}:${item.label}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {section.metadata?.length ? (
              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {section.metadata.map((item) => (
                  <p key={`${section.title}:${item}`}>{item}</p>
                ))}
              </div>
            ) : null}
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
