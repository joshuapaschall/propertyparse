import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthControls } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import InternalCostPanel from '../components/InternalCostPanel';
import { getApiErrorInfo, getMetricsSummary, MetricsRange, MetricsSummary } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { readLocalParsePersistenceState } from '../lib/persistenceStatus';
import { subscribeJobUpdates } from '../lib/liveUpdates';
import { flattenUsageSummary } from '../lib/usageSummary';
import { buildAdminCostSections, buildProductSafeCostItems } from '../lib/costTelemetry';
import { hasLocalOnlyBillingWarning, LOCAL_ONLY_BILLING_WARNING } from '../lib/telemetryWarnings';

const ranges: Array<{ key: MetricsRange | 'custom'; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom Range' },
];

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0) || 0);

export default function DashboardPage() {
  const { role } = useAuthControls();
  const isPrivileged = role === 'admin' || role === 'owner';
  const { showToast } = useToast();
  const [range, setRange] = useState<MetricsRange | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localParsePersistenceWarning, setLocalParsePersistenceWarning] = useState(false);
  const hasLoadedMetricsRef = useRef(false);

  useEffect(() => {
    const state = readLocalParsePersistenceState();
    setLocalParsePersistenceWarning(Boolean(state?.persistenceWarning));
  }, []);

  const loadMetrics = useCallback(async () => {
    const hasExistingMetrics = hasLoadedMetricsRef.current;
    if (hasExistingMetrics) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);
    try {
      const data = await getMetricsSummary(range === 'custom' ? 'month' : range, {
        startDate: range === 'custom' ? customStart || undefined : undefined,
        endDate: range === 'custom' ? customEnd || undefined : undefined,
      });
      setMetrics(data);
      hasLoadedMetricsRef.current = true;
    } catch (err) {
      const info = getApiErrorInfo(err);
      const message = info?.message ?? (err as Error).message ?? 'Unable to load dashboard metrics.';
      setError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [customEnd, customStart, range, showToast]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    const unsubscribe = subscribeJobUpdates(() => {
      void loadMetrics();
    });
    return unsubscribe;
  }, [loadMetrics]);

  useEffect(() => {
    const onFocus = () => {
      void loadMetrics();
    };
    const onVisibility = () => {
      if (!document.hidden) {
        void loadMetrics();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadMetrics]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void loadMetrics();
      }
    }, 25000);
    return () => window.clearInterval(timer);
  }, [loadMetrics]);

  const usageMetrics = useMemo(() => (metrics ? flattenUsageSummary(metrics as Record<string, unknown>) : null), [metrics]);

  const kpis = useMemo(() => {
    const spend = toNumber(metrics?.total_cost_usd ?? metrics?.spend_usd ?? metrics?.spendUsd);
    return [
      ['Files Uploaded', toNumber(metrics?.files_uploaded ?? metrics?.uploads)],
      ['Potential Properties', toNumber(metrics?.potential_properties ?? metrics?.leads)],
      ['Unique Valid', toNumber(metrics?.valid_unique)],
      ['Review Queue', toNumber(metrics?.review_queue_total ?? metrics?.needs_review)],
      ['Exports', toNumber(metrics?.exports)],
      ['Total Cost', spend.toLocaleString(undefined, { style: 'currency', currency: 'USD' })],
    ];
  }, [metrics]);

  const secondary = useMemo(
    () => [
      ['Needs Review', toNumber(metrics?.needs_review)],
      ['Skipped', toNumber(metrics?.skipped)],
      ['Out of Scope', toNumber(metrics?.out_of_scope)],
      ['Duplicates', toNumber(metrics?.duplicates)],
      ['Excluded Total', toNumber(metrics?.excluded_total)],
    ],
    [metrics],
  );

  const hasZeroDurableMetrics = useMemo(() => {
    if (!metrics) return false;
    return (
      toNumber(metrics.files_uploaded ?? metrics.uploads) === 0 &&
      toNumber(metrics.potential_properties ?? metrics.leads) === 0 &&
      toNumber(metrics.valid_unique) === 0 &&
      toNumber(metrics.review_queue_total ?? metrics.needs_review) === 0 &&
      toNumber(metrics.exports) === 0
    );
  }, [metrics]);

  const costPanelSections = useMemo(
    () =>
      isPrivileged
        ? buildAdminCostSections({
            usage: usageMetrics ?? {},
            estimatedJobCost: metrics?.total_cost_usd ?? metrics?.spend_usd ?? metrics?.spendUsd,
            estimatedMonthlyTotal: metrics?.google_month_to_date_actual_or_estimated_cost_usd ?? metrics?.estimated_monthly_total_usd ?? metrics?.estimated_monthly_cost_usd ?? metrics?.total_cost_usd ?? metrics?.spend_usd ?? metrics?.spendUsd,
            jobGeocodingCalls: (metrics as Record<string, unknown>)?.job_geocoding_calls ?? metrics?.googleCalls,
          }).filter((section) => section.title === 'Month to date')
        : undefined,
    [isPrivileged, metrics, usageMetrics],
  );

  const showLocalOnlyBillingWarning = useMemo(
    () => hasLocalOnlyBillingWarning(usageMetrics ?? {}),
    [usageMetrics],
  );

  const costPanelItems = useMemo(
    () => buildProductSafeCostItems({
      usage: usageMetrics ?? {},
      estimatedJobCost: metrics?.total_cost_usd ?? metrics?.spend_usd ?? metrics?.spendUsd,
      creditsUsed: metrics?.exports,
    }),
    [metrics, usageMetrics],
  );

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

        {initialLoading && !metrics ? (
          <EmptyState className="mt-6" title="Loading dashboard" description="Fetching summary metrics..." />
        ) : error && !metrics ? (
          <EmptyState className="mt-6" title="Dashboard unavailable" description={error} />
        ) : (
          <>
            {refreshing ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p>
            ) : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {kpis.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value as any}</p>
                  {label === 'Review Queue' ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Rows still requiring review or correction.</p>
                  ) : null}
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
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Excluded Total: Rows not exportable because they were skipped, out of scope, or duplicates.</p>
            {localParsePersistenceWarning && hasZeroDurableMetrics ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Dashboard metrics only include saved jobs. Your last run may be missing until backend persistence is restored.
              </p>
            ) : null}
            <div className="mt-6">
              {showLocalOnlyBillingWarning ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                  {LOCAL_ONLY_BILLING_WARNING}
                </div>
              ) : null}
              <InternalCostPanel
                title={isPrivileged ? 'Internal cost transparency' : 'Usage estimate'}
                subtitle={
                  isPrivileged
                    ? 'Visible to admin and owner roles only.'
                    : 'A product-safe estimate without internal vendor details.'
                }
                items={costPanelItems}
                sections={costPanelSections}
                isPrivileged={isPrivileged}
              />
            </div>
          </>
        )}
      </Card>
    </AppShell>
  );
}
