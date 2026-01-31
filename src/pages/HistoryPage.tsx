import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { downloadJobExport, getJobs, JobExportType, JobRecord } from '../lib/api';

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

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

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
        return {
          jobId,
          hasId: Boolean(jobId),
          timestamp: pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']),
          filename: pickString(job, [
            'filename',
            'fileName',
            'original_filename',
            'originalFilename',
            'file',
          ]),
          rowsReceived: pickNumber(job, ['rowsReceived', 'rows_received', 'rows', 'rowCount']),
          matched: pickNumber(job, ['matched', 'matched_count', 'matchedCount']),
          unmatched: pickNumber(job, ['unmatched', 'unmatched_count', 'unmatchedCount']),
          cacheHits: pickNumber(job, ['cacheHits', 'cache_hits', 'cache_hit_count']),
          googleCallsUsed: pickNumber(job, [
            'googleCallsUsed',
            'google_calls_used',
            'googleCalls',
            'apiCallsUsed',
          ]),
        };
      }),
    [jobs],
  );

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
                Click a job to view detailed matched/unmatched previews.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Loading job history...
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No parse jobs yet. Run your first parse to see history here.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date/Time</th>
                      <th className="px-4 py-3">Filename</th>
                      <th className="px-4 py-3 text-right">Rows Received</th>
                      <th className="px-4 py-3 text-right">Matched</th>
                      <th className="px-4 py-3 text-right">Unmatched</th>
                      <th className="px-4 py-3 text-right">Cache Hits</th>
                      <th className="px-4 py-3 text-right">Google Calls</th>
                      <th className="px-4 py-3 text-right">Exports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row, index) => (
                      <tr
                        key={row.jobId || `job-${index}`}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-900 ${row.hasId ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => {
                          if (row.hasId) {
                            navigate(`/history/${row.jobId}`);
                          }
                        }}
                      >
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {formatDateTime(row.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {row.filename ?? 'Untitled file'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                          {row.rowsReceived ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                          {row.matched ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                          {row.unmatched ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                          {row.cacheHits ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                          {row.googleCallsUsed ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDownload(
                                  row.jobId,
                                  'matched',
                                  `${row.jobId}-matched.csv`,
                                );
                              }}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              disabled={!row.hasId || downloading[`${row.jobId}-matched`]}
                            >
                              {downloading[`${row.jobId}-matched`] ? 'Downloading...' : 'Matched'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDownload(
                                  row.jobId,
                                  'unmatched',
                                  `${row.jobId}-unmatched.csv`,
                                );
                              }}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              disabled={!row.hasId || downloading[`${row.jobId}-unmatched`]}
                            >
                              {downloading[`${row.jobId}-unmatched`]
                                ? 'Downloading...'
                                : 'Unmatched'}
                            </button>
                          </div>
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
