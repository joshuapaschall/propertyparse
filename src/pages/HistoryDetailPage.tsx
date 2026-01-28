import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { downloadJobExport, getJob, JobRecord } from '../lib/api';

type ParsedPreviewRow = {
  id: string;
  fullAddress: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  sourceRaw: string;
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

const createId = (row: Record<string, unknown>, index: number) =>
  (row.id as string) || (row.uuid as string) || `${crypto.randomUUID?.() ?? `row-${index}`}`;

const stringifyValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
};

const normalizeRow = (row: Record<string, unknown>, index: number): ParsedPreviewRow => {
  const fullAddress =
    (row.full_address as string) ||
    (row.fullAddress as string) ||
    (row.address_full as string) ||
    (row.address as string) ||
    (row.address_raw as string) ||
    '';
  const streetAddress =
    (row.street_address as string) ||
    (row.streetAddress as string) ||
    (row.address_line1 as string) ||
    (row.street as string) ||
    '';
  const city = (row.city as string) || (row.city_raw as string) || '';
  const state = (row.state as string) || (row.state_raw as string) || '';
  const zipCode =
    (row.zip as string) ||
    (row.zip_code as string) ||
    (row.zipCode as string) ||
    (row.zip_raw as string) ||
    '';
  const sourceRaw =
    (row.source_raw as string) ||
    (row.raw as string) ||
    (row.source as string) ||
    (row.address_raw as string) ||
    stringifyValue(row);

  return {
    id: createId(row, index),
    fullAddress,
    streetAddress,
    city,
    state,
    zipCode,
    sourceRaw,
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

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getJob(jobId);
        if (active) setJob(response ?? null);
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
        'filename',
        'fileName',
        'original_filename',
        'originalFilename',
        'file',
      ]),
      createdAt: pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']),
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
  }, [job]);

  const { matchedRows, unmatchedRows } = useMemo(() => {
    if (!job) return { matchedRows: [], unmatchedRows: [] };
    const rawMatched =
      (pickValue(job, ['matchedRows', 'matched', 'items']) as unknown[]) ?? [];
    const rawUnmatched = (pickValue(job, ['unmatchedRows', 'unmatched']) as unknown[]) ?? [];
    return {
      matchedRows: normalizeRows(Array.isArray(rawMatched) ? rawMatched : []).slice(0, PREVIEW_LIMIT),
      unmatchedRows: normalizeRows(Array.isArray(rawUnmatched) ? rawUnmatched : []).slice(
        0,
        PREVIEW_LIMIT,
      ),
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
          <Link to="/history" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            ← Back to history
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownload('matched')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              disabled={!jobId || downloading[`${jobId}-matched`]}
            >
              {downloading[`${jobId}-matched`] ? 'Downloading...' : 'Download matched CSV'}
            </button>
            <button
              type="button"
              onClick={() => handleDownload('unmatched')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              disabled={!jobId || downloading[`${jobId}-unmatched`]}
            >
              {downloading[`${jobId}-unmatched`] ? 'Downloading...' : 'Download unmatched CSV'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading job details...
            </div>
          ) : jobSummary ? (
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div>
                <h2 className="text-lg font-semibold">Summary</h2>
                <p className="text-sm text-slate-500">
                  {jobSummary.filename ?? 'Untitled file'} • {formatDateTime(jobSummary.createdAt)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Rows Received</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {jobSummary.rowsReceived ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Matched</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {jobSummary.matched ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Unmatched</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {jobSummary.unmatched ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Cache Hits</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {jobSummary.cacheHits ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Google Calls</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {jobSummary.googleCallsUsed ?? '--'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Job details not found.
            </div>
          )}
          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('matched')}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  activeTab === 'matched' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
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
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                Unmatched Preview
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {showRaw ? 'Hide Source / Raw' : 'Show Source / Raw'}
            </button>
          </div>
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Full Address</th>
                    <th className="px-4 py-3">Street Address</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Zip Code</th>
                    {showRaw ? <th className="px-4 py-3">Source / Raw</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(activeTab === 'matched' ? matchedRows : unmatchedRows).length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={showRaw ? 6 : 5}>
                        No preview rows available. Download the CSV for the full dataset.
                      </td>
                    </tr>
                  ) : (
                    (activeTab === 'matched' ? matchedRows : unmatchedRows).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800">{row.fullAddress}</td>
                        <td className="px-4 py-3 text-slate-700">{row.streetAddress}</td>
                        <td className="px-4 py-3 text-slate-700">{row.city}</td>
                        <td className="px-4 py-3 text-slate-700">{row.state}</td>
                        <td className="px-4 py-3 text-slate-700">{row.zipCode}</td>
                        {showRaw ? (
                          <td className="px-4 py-3 text-xs text-slate-500">{row.sourceRaw}</td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Showing up to {PREVIEW_LIMIT} rows. Download the CSV for full results.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
