import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Card, { SectionHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { getBadgeVariant } from '../components/ui/badgeVariant';
import EmptyState from '../components/ui/EmptyState';
import { BatchRollup, getApiErrorInfo, getBatches, getMetricsSummary, MetricsRange, MetricsSummary } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { readLocalParsePersistenceState } from '../lib/persistenceStatus';
import { subscribeJobUpdates } from '../lib/liveUpdates';

const ranges: Array<{ key: MetricsRange | 'custom'; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom Range' },
];

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0) || 0);

function Stat({ label, value, hint, variant = 'default' }: { label: string; value: string | number; hint?: string; variant?: 'primary' | 'default' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 ${variant === 'primary' ? 'border-t-2 border-t-indigo-500' : ''}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 font-semibold ${variant === 'primary' ? 'text-3xl text-indigo-600 dark:text-indigo-400' : 'text-2xl text-slate-900 dark:text-white'}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {variant === 'primary' ? <>{/* TODO: prior-period delta */}</> : null}
    </div>
  );
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [range, setRange] = useState<MetricsRange | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<BatchRollup[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);
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
    let active = true;
    const loadBatches = async () => {
      setBatchesLoading(true);
      setBatchesError(null);
      try {
        const data = await getBatches({ limit: 5 });
        if (!active) return;
        setBatches(data.items);
      } catch (err) {
        if (!active) return;
        const info = getApiErrorInfo(err);
        const message = info?.message ?? (err as Error).message ?? 'Unable to load recent batches.';
        setBatchesError(message);
      } finally {
        if (active) setBatchesLoading(false);
      }
    };
    void loadBatches();
    return () => {
      active = false;
    };
  }, []);

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


  const spend = useMemo(
    () => toNumber(metrics?.total_cost_usd ?? metrics?.spend_usd ?? metrics?.spendUsd),
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
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Stat label="Cost This Period" value={spend.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} variant="primary" />
              <Stat label="Files" value={toNumber(metrics?.files_uploaded ?? metrics?.uploads)} />
              <Stat label="Addresses In" value={toNumber(metrics?.potential_properties ?? metrics?.leads)} />
              <Stat label="Verified Unique" value={toNumber(metrics?.valid_unique)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Stat label="Needs Review" value={toNumber(metrics?.review_queue_total ?? metrics?.needs_review)} hint="Rows still requiring review" />
              <Stat label="Exports" value={toNumber(metrics?.exports)} />
              <Stat label="Excluded Total" value={toNumber(metrics?.excluded_total)} />
            </div>
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" title="Excluded Total = skipped + out of scope + duplicates.">
              Metadata: Skipped {toNumber(metrics?.skipped)} • Out of Scope {toNumber(metrics?.out_of_scope)} • Duplicates {toNumber(metrics?.duplicates)}.
            </p>
            {localParsePersistenceWarning && hasZeroDurableMetrics ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Dashboard metrics only include saved jobs. Your last run may be missing until backend persistence is restored.
              </p>
            ) : null}
            <div className="mt-8">
              <SectionHeader title="Recent batches" subtitle="Latest batch uploads across your parsing pipeline." />
              {batchesLoading ? (
                <EmptyState className="mt-4" title="Loading batches" description="Fetching recent batch uploads..." />
              ) : batchesError ? (
                <EmptyState className="mt-4" title="Recent batches unavailable" description={batchesError} />
              ) : batches.length === 0 ? (
                <EmptyState className="mt-4" title="No batches yet" />
              ) : (
                <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {batches.map((item) => {
                    const batchName = item.batch.campaign_name || item.batch.name || 'Untitled batch';
                    const createdAt = item.batch.created_at ? new Date(item.batch.created_at).toLocaleString() : '--';
                    return (
                      <li key={item.batch.id}>
                        <Link to={`/history?search=${encodeURIComponent(batchName)}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{batchName}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.row_totals.total_rows} rows, {item.row_totals.matched_count} valid</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={getBadgeVariant(item.effective_status)}>{item.effective_status}</Badge>
                            <Badge className="font-mono">{item.job_counts.total} {item.job_counts.total === 1 ? 'job' : 'jobs'}</Badge>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{createdAt}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </Card>
    </AppShell>
  );
}
