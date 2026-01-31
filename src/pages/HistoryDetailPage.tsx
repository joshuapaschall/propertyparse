import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { downloadJobExport, getJobDetail, getJobRows, JobRecord } from '../lib/api';

type ParsedPreviewRow = {
  id: string;
  rowIndex: number | null;
  addressRaw: string;
  matchedAddress: string;
  status: string;
  source: string;
};

const PREVIEW_LIMIT = 50;

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

const createId = (row: Record<string, unknown>, index: number, rowIndex: number | null) =>
  (row.id as string) ||
  (row.uuid as string) ||
  `${rowIndex ?? index}-${crypto.randomUUID?.() ?? `row-${index}`}`;

const stringifyValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
};

const normalizeRow = (row: Record<string, unknown>, index: number): ParsedPreviewRow => {
  const rowIndexValue = row.row_index ?? row.rowIndex ?? row.index ?? null;
  const rowIndex =
    typeof rowIndexValue === 'number'
      ? rowIndexValue
      : typeof rowIndexValue === 'string'
        ? Number(rowIndexValue)
        : null;
  const addressRaw =
    (row.address_raw as string) || (row.addressRaw as string) || (row.address as string) || '';
  const matchedAddress =
    (row.matched_address as string) ||
    (row.matchedAddress as string) ||
    (row.address_matched as string) ||
    '';
  const status =
    (row.status as string) || (row.match_status as string) || (row.matchStatus as string) || '';
  const source =
    (row.source as string) ||
    (row.source_raw as string) ||
    (row.raw as string) ||
    (row.address_raw as string) ||
    stringifyValue(row);

  return {
    id: createId(row, index, Number.isNaN(rowIndex as number) ? null : rowIndex),
    rowIndex: Number.isNaN(rowIndex as number) ? null : rowIndex,
    addressRaw,
    matchedAddress,
    status,
    source,
  };
};

const normalizeRows = (items: unknown[]) =>
  items.map((item, index) => normalizeRow(item as Record<string, unknown>, index));

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function HistoryDetailPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched'>('matched');
  const [showRaw, setShowRaw] = useState(false);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [matchedRows, setMatchedRows] = useState<ParsedPreviewRow[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<ParsedPreviewRow[]>([]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [jobResponse, matchedResponse, unmatchedResponse] = await Promise.all([
          getJobDetail(jobId),
          getJobRows(jobId, 'Matched', PREVIEW_LIMIT, 0),
          getJobRows(jobId, 'Unmatched', PREVIEW_LIMIT, 0),
        ]);
        if (active) {
          const combinedJob = {
            ...(jobResponse.summary ?? {}),
            ...(jobResponse.job ?? {}),
          };
          setJob(Object.keys(combinedJob).length ? combinedJob : null);
          setMatchedRows(normalizeRows(matchedResponse ?? []));
          setUnmatchedRows(normalizeRows(unmatchedResponse ?? []));
        }
      } catch (err) {
        if (active) setError((err as Error).message ?? 'Unable to load job details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [jobId]);

  const jobSummary = useMemo(() => {
    if (!job) return null;
    return {
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
      createdAt: pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']),
      rowsReceived: pickNumber(job, ['rowsReceived', 'rows_received', 'total_rows', 'rows', 'rowCount']),
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
  }, [job]);

  const handleDownload = async (type: 'matched' | 'unmatched') => {
    if (!jobId) return;
    const key = `${jobId}-${type}`;
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await downloadJobExport(jobId, type);
      triggerDownload(result.blob, result.filename);
    } catch (err) {
      setError((err as Error).message ?? 'Export failed.');
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <AppShell title="Job Details" subtitle="Review matched and unmatched previews.">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/history"
            className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            ← Back to history
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownload('matched')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={!jobId || downloading[`${jobId}-matched`]}
            >
              {downloading[`${jobId}-matched`] ? 'Downloading...' : 'Download matched CSV'}
            </button>
            <button
              type="button"
              onClick={() => handleDownload('unmatched')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={!jobId || downloading[`${jobId}-unmatched`]}
            >
              {downloading[`${jobId}-unmatched`] ? 'Downloading...' : 'Download unmatched CSV'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Loading job details...
            </div>
          ) : jobSummary ? (
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div>
                <h2 className="text-lg font-semibold">Summary</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {jobSummary.filename ?? 'Untitled file'} • {formatDateTime(jobSummary.createdAt)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Rows Received</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {jobSummary.rowsReceived ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Matched</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {jobSummary.matched ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Unmatched</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {jobSummary.unmatched ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Cache Hits</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {jobSummary.cacheHits ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Google Calls</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {jobSummary.googleCallsUsed ?? '--'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Job details not found.
            </div>
          )}
          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('matched')}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  activeTab === 'matched'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                Matched Preview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('unmatched')}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  activeTab === 'unmatched'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                Unmatched Preview
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {showRaw ? 'Hide Source / Raw' : 'Show Source / Raw'}
            </button>
          </div>
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Address Raw</th>
                    <th className="px-4 py-3">Matched Address</th>
                    <th className="px-4 py-3">Status</th>
                    {showRaw ? <th className="px-4 py-3">Source / Raw</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(activeTab === 'matched' ? matchedRows : unmatchedRows).length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                        colSpan={showRaw ? 5 : 4}
                      >
                        No preview rows available. Download the CSV for the full dataset.
                      </td>
                    </tr>
                  ) : (
                    (activeTab === 'matched' ? matchedRows : unmatchedRows).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                          {row.rowIndex ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {row.addressRaw}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {row.matchedAddress}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {row.status}
                        </td>
                        {showRaw ? (
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            {row.source}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Showing up to {PREVIEW_LIMIT} rows. Download the CSV for full results.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
