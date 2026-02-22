import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { downloadJobExport, JobExportType, JobRecord, getJobs } from '../lib/api';

const EXPORT_OPTIONS: Array<{ label: string; type: JobExportType }> = [
  { label: 'Unique Valid', type: 'unique_valid' },
  { label: 'Needs Review', type: 'needs_review' },
  { label: 'Processing Report', type: 'processing_report' },
  { label: 'Matched', type: 'matched' },
  { label: 'Unmatched', type: 'unmatched' },
];

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

const formatDateTime = (value: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatCurrency = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeStatus = (raw: string | null) => {
  if (!raw) return 'RUNNING';
  const status = raw.toUpperCase();
  if (status.includes('FAIL')) return 'FAILED';
  if (status.includes('DONE') || status.includes('COMPLETE') || status.includes('SUCCESS')) return 'DONE';
  if (status.includes('RUN') || status.includes('PENDING') || status.includes('PROCESS')) return 'RUNNING';
  return status;
};

const statusClasses: Record<string, string> = {
  RUNNING:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300',
  DONE: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-300',
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'DONE' | 'FAILED'>('ALL');

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
          setError((err as Error).message ?? 'Unable to load history.');
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

  const rows = useMemo(
    () =>
      jobs.map((job) => {
        const jobId = pickString(job, ['job_id', 'jobId', 'id']) ?? '';
        const validUnique = pickNumber(job, ['valid_unique', 'validUnique']);
        const needsReview =
          pickNumber(job, ['needs_review', 'needsReview']) ??
          [
            pickNumber(job, ['duplicates']),
            pickNumber(job, ['unmatched', 'unmatched_count', 'unmatchedCount']),
            pickNumber(job, ['skipped']),
            pickNumber(job, ['out_of_scope', 'outOfScope']),
          ]
            .filter((value): value is number => value !== null)
            .reduce((sum, value) => sum + value, 0);
        const state = pickString(job, ['state']);
        const county = pickString(job, ['county']);
        const city = pickString(job, ['city']);
        const location = [state, county, city].filter(Boolean).join(' / ');
        return {
          jobId,
          hasId: Boolean(jobId),
          timestamp: pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']),
          filename: pickString(job, [
            'display_name',
            'displayName',
            'filename',
            'file_name',
            'fileName',
            'original_filename',
            'originalFilename',
            'file',
          ]),
          name: pickString(job, ['jobName', 'campaign_name']) ?? 'Untitled job',
          location: location || '--',
          rowsReceived: pickNumber(job, ['rowsReceived', 'rows_received', 'total_rows', 'rows', 'rowCount']),
          validUnique,
          needsReview,
          spendUsd: pickNumber(job, ['spend_usd', 'spendUsd']),
          calls: pickNumber(job, ['google_calls_used', 'googleCallsUsed', 'googleCalls', 'apiCallsUsed']),
          cacheHits: pickNumber(job, ['cache_hits', 'cacheHits', 'cache_hit_count']),
          ocrCalls: pickNumber(job, ['openai_ocr_calls_used', 'ocr_calls_used', 'ocrCallsUsed']),
          status: normalizeStatus(pickString(job, ['status', 'job_status', 'state'])),
        };
      }),
    [jobs],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'ALL' ? true : row.status === statusFilter;
      const matchesSearch =
        term.length === 0
          ? true
          : [row.filename ?? '', row.name]
              .join(' ')
              .toLowerCase()
              .includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  const handleDownload = async (jobId: string, type: JobExportType, filename?: string | null) => {
    if (!jobId) return;
    const key = `${jobId}-${type}`;
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await downloadJobExport(jobId, type);
      triggerDownload(result.blob, filename ?? result.filename);
    } catch (err) {
      setError((err as Error).message ?? 'Export failed.');
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <AppShell title="History" subtitle="Review past parsing jobs and export results.">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Parse Jobs</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Track status, costs, and quality metrics for every run.
              </p>
            </div>
            <div className="w-full max-w-xs">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by filename or job name"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['ALL', 'RUNNING', 'DONE', 'FAILED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === status
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Loading job history...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No jobs match your current search/filter.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date/Time</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Rows</th>
                      <th className="px-4 py-3 text-right">Valid Unique</th>
                      <th className="px-4 py-3 text-right">Needs Review</th>
                      <th className="px-4 py-3 text-right">Spend</th>
                      <th className="px-4 py-3">Calls</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Export</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRows.map((row, index) => (
                      <tr
                        key={row.jobId || `job-${index}`}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-900 ${row.hasId ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => {
                          if (row.hasId) {
                            navigate(`/history/${row.jobId}`);
                          }
                        }}
                      >
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDateTime(row.timestamp)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{row.filename ?? '--'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.location}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{row.rowsReceived ?? '--'}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{row.validUnique ?? '--'}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{row.needsReview ?? '--'}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{formatCurrency(row.spendUsd)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          <div className="space-y-1 text-xs">
                            <div>Google: {row.calls ?? '--'}</div>
                            <div>Cache: {row.cacheHits ?? '--'}</div>
                            <div>OCR: {row.ocrCalls ?? '--'}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[row.status] ?? 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                          <details className="relative inline-block text-left">
                            <summary className="list-none rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                              Export
                            </summary>
                            <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                              {EXPORT_OPTIONS.map((option) => {
                                const key = `${row.jobId}-${option.type}`;
                                return (
                                  <button
                                    key={option.type}
                                    type="button"
                                    onClick={() => {
                                      handleDownload(row.jobId, option.type, `${row.jobId}-${option.type}.csv`);
                                    }}
                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition last:border-b-0 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                                    disabled={!row.hasId || downloading[key]}
                                  >
                                    {downloading[key] ? 'Downloading...' : option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
