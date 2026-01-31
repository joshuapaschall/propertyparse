import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { getJobs, JobRecord } from '../lib/api';

type RangeKey = 'today' | 'week' | 'month' | 'year';

type MetricTotals = {
  uploads: number;
  leads: number;
  matched: number;
  unmatched: number;
  exports: number;
  googleCalls: number;
};

type MetricConfig = {
  key: keyof MetricTotals;
  label: string;
  description: string;
};

const metricConfigs: MetricConfig[] = [
  {
    key: 'uploads',
    label: 'Uploads',
    description: 'Total parsing jobs created.',
  },
  {
    key: 'leads',
    label: 'Leads',
    description: 'Rows received across uploads.',
  },
  {
    key: 'matched',
    label: 'Matched',
    description: 'Matched rows returned.',
  },
  {
    key: 'unmatched',
    label: 'Unmatched',
    description: 'Unmatched rows returned.',
  },
  {
    key: 'exports',
    label: 'Exports',
    description: 'Exports generated from jobs.',
  },
  {
    key: 'googleCalls',
    label: 'Google Calls',
    description: 'Google API calls used.',
  },
];

const rangeTabs: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const getStoredRole = () =>
  window.localStorage.getItem('pp-role') ?? window.localStorage.getItem('pp-user-role');

const pickValue = (job: JobRecord, keys: string[]) => {
  for (const key of keys) {
    const value = job[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const pickString = (job: JobRecord, keys: string[]) => {
  const value = pickValue(job, keys);
  return typeof value === 'string' ? value : value != null ? String(value) : null;
};

const pickNumber = (job: JobRecord, keys: string[]) => {
  const value = pickValue(job, keys);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getRangeStarts = (now: Date): Record<RangeKey, Date> => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return {
    today,
    week: weekStart,
    month: monthStart,
    year: yearStart,
  };
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const emptyTotals = (): MetricTotals => ({
  uploads: 0,
  leads: 0,
  matched: 0,
  unmatched: 0,
  exports: 0,
  googleCalls: 0,
});

export default function AdminPage() {
  const storedRole = getStoredRole();
  const hasRoleInfo = storedRole !== null && storedRole !== '';
  const isAdmin = storedRole === 'admin';
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<RangeKey>('today');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getJobs();
        if (active) {
          setJobs(response ?? []);
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message ?? 'Unable to load admin metrics.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const totalsByRange = useMemo(() => {
    const now = new Date();
    const rangeStarts = getRangeStarts(now);
    const totals: Record<RangeKey, MetricTotals> = {
      today: emptyTotals(),
      week: emptyTotals(),
      month: emptyTotals(),
      year: emptyTotals(),
    };

    jobs.forEach((job) => {
      const createdAt = pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']);
      if (!createdAt) return;
      const createdDate = new Date(createdAt);
      if (Number.isNaN(createdDate.getTime())) return;

      const rows = pickNumber(job, ['rowsReceived', 'rows_received', 'total_rows', 'rows', 'rowCount']) ?? 0;
      const matched = pickNumber(job, ['matched', 'matched_count', 'matchedCount']) ?? 0;
      const unmatched = pickNumber(job, ['unmatched', 'unmatched_count', 'unmatchedCount']) ?? 0;
      const exportsCount =
        pickNumber(job, ['exports_count', 'exportsCount', 'exportCount', 'exports']) ?? 0;
      const googleCalls =
        pickNumber(job, ['googleCallsUsed', 'google_calls_used', 'googleCalls', 'apiCallsUsed']) ?? 0;

      (Object.keys(rangeStarts) as RangeKey[]).forEach((rangeKey) => {
        if (createdDate >= rangeStarts[rangeKey]) {
          totals[rangeKey].uploads += 1;
          totals[rangeKey].leads += rows;
          totals[rangeKey].matched += matched;
          totals[rangeKey].unmatched += unmatched;
          totals[rangeKey].exports += exportsCount;
          totals[rangeKey].googleCalls += googleCalls;
        }
      });
    });

    return totals;
  }, [jobs]);

  const activeTotals = totalsByRange[activeRange];

  return (
    <AppShell title="Admin" subtitle="Monitor parsing usage across your account.">
      {!hasRoleInfo || !isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Not authorized
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Admin access is restricted. If you believe you should have access, contact your account
            owner.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Admin Metrics</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Snapshot totals from Supabase-backed parsing jobs.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {rangeTabs.map((tab) => {
                  const isActive = tab.key === activeRange;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveRange(tab.key)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {loading ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Loading admin metrics...
              </div>
            ) : error ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-600 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {metricConfigs.map((metric) => (
                  <div
                    key={metric.key}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                  >
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {metric.label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                      {formatNumber(activeTotals[metric.key])}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {metric.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
