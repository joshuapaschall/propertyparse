import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { getApiErrorInfo, getMetricsSummary, MetricsRange, MetricsSummary } from '../lib/api';
import { useToast } from '../components/ui/ToastProvider';
import { readLocalParsePersistenceState } from '../lib/persistenceStatus';

const ranges: Array<{ key: MetricsRange | 'custom'; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom Range' },
];

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0) || 0);

export default function DashboardPage() {
  const { showToast } = useToast();
  const [range, setRange] = useState<MetricsRange | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localParsePersistenceWarning, setLocalParsePersistenceWarning] = useState(false);

  useEffect(() => {
    const state = readLocalParsePersistenceState();
    setLocalParsePersistenceWarning(Boolean(state?.persistenceWarning));
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMetricsSummary(range === 'custom' ? 'month' : range, {
          startDate: range === 'custom' ? customStart || undefined : undefined,
          endDate: range === 'custom' ? customEnd || undefined : undefined,
        });
        if (!active) return;
        setMetrics(data);
      } catch (err) {
        if (!active) return;
        const info = getApiErrorInfo(err);
        const message = info?.message ?? (err as Error).message ?? 'Unable to load dashboard metrics.';
        setError(message);
        showToast({ title: message, variant: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [range, customStart, customEnd, showToast]);

  const kpis = useMemo(() => {
    const spend = toNumber(metrics?.spend_usd ?? metrics?.spendUsd);
    return [
      ['Files Uploaded', toNumber(metrics?.uploads)],
      ['Potential Properties', toNumber(metrics?.leads)],
      ['Unique Valid', toNumber(metrics?.matched)],
      ['Unresolved', toNumber(metrics?.unmatched)],
      ['Exports', toNumber(metrics?.exports)],
      ['Total Cost', spend.toLocaleString(undefined, { style: 'currency', currency: 'USD' })],
    ];
  }, [metrics]);

  const secondary = useMemo(
    () => [
      ['Needs Review', toNumber(metrics?.needs_review ?? metrics?.unmatched)],
      ['Skipped', toNumber(metrics?.skipped)],
      ['Out of Scope', toNumber(metrics?.out_of_scope)],
      ['Duplicates', toNumber(metrics?.duplicates)],
    ],
    [metrics],
  );

  const hasZeroDurableMetrics = useMemo(() => {
    if (!metrics) return false;
    return (
      toNumber(metrics.uploads) === 0 &&
      toNumber(metrics.leads) === 0 &&
      toNumber(metrics.matched) === 0 &&
      toNumber(metrics.unmatched) === 0 &&
      toNumber(metrics.exports) === 0
    );
  }, [metrics]);

  return (
    <AppShell title="Dashboard" subtitle="Workflow-first metrics across your parsing pipeline.">
      <Card>
        <SectionHeader
          title="Performance overview"
          subtitle="Track throughput, quality, and spend with consistent parse labels."
          action={
            <div className="flex flex-wrap gap-2">
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    range === item.key
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        />
        {range === 'custom' ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <input aria-label="Custom start date" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
            <input aria-label="Custom end date" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </div>
        ) : null}

        {loading ? (
          <EmptyState className="mt-6" title="Loading dashboard" description="Fetching summary metrics..." />
        ) : error ? (
          <EmptyState className="mt-6" title="Dashboard unavailable" description={error} />
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {kpis.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value as any}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {secondary.map(([label, value]) => (
                <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {label}: {value}
                </span>
              ))}
            </div>
            {localParsePersistenceWarning && hasZeroDurableMetrics ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Dashboard metrics only include saved jobs. Your last run may be missing until backend persistence is restored.
              </p>
            ) : null}
          </>
        )}
      </Card>
    </AppShell>
  );
}
