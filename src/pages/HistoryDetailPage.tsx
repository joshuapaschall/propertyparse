import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import TablePagination from '../components/TablePagination';
import { downloadJobExport, getJobDetail, getJobExportCatalog, getJobResults, JobExportType, JobRecord } from '../lib/api';
import { groupRows, GroupedRow } from '../lib/groupRows';
import {
  getReasonMetadata,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  stringifyPreview,
} from '../lib/parseUtils';
import { useToast } from '../components/ui/ToastProvider';
import ExportPanel from '../components/exports/ExportPanel';
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import type { ExportCatalogItem } from '../types/exports';
import type { CanonicalAddress, ParseSummary, RowResult } from '../types/parse';

type ResultsTab = 'valid' | 'needs_review' | 'out_of_scope' | 'skipped' | 'duplicates';

type JobSummaryMeta = {
  filename: string | null;
  createdAt: string | null;
};

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

const formatDateTime = (value: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
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

const normalizeCanonicalAddress = (row: CanonicalAddress) => {
  const components = (row.components ?? {}) as Record<string, unknown>;
  return {
    ...row,
    fullAddress: (row as { full_address?: string }).full_address || row.formatted_address || '',
    street1: row.street1 || (components.street_address as string) || (components.street1 as string) || '',
    street2: row.street2 || (components.address2 as string) || (components.street2 as string) || '',
    city: row.city || (components.city as string) || '',
    state: row.state || (components.state as string) || '',
    zip: row.zip || (components.zip as string) || (components.zip_code as string) || '',
  };
};

const rowDisplayId = (row: RowResult) => row.source_row_id || row.source_row_index || '--';
const getInputAddress = (row: RowResult) => row.address_raw || row.detected_address || '--';
const getMatchedAddress = (row: RowResult) => row.matched_address || row.formatted_address || '—';
const getMatchedCounty = (row: RowResult) => {
  const components = (row.components ?? {}) as Record<string, unknown>;
  return (components.county as string) || (components.matched_county as string) || '—';
};
const getMatchedCity = (row: RowResult) => {
  const components = (row.components ?? {}) as Record<string, unknown>;
  return row.formatted_address?.split(',')?.[1]?.trim() || row.detected_address?.split(',')?.[1]?.trim() || (components.city as string) || '—';
};
const getStatusLabel = (row: RowResult) => row.status || '--';

export default function HistoryDetailPage() {
  const { showToast } = useToast();
  const { jobId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [exportCatalog, setExportCatalog] = useState<ExportCatalogItem[]>(FALLBACK_EXPORT_CATALOG);
  const [activeTab, setActiveTab] = useState<ResultsTab>('valid');
  const [showRaw, setShowRaw] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(10);

  const [jobMeta, setJobMeta] = useState<JobSummaryMeta | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof getJobResults>> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [jobDetail, jobResults, catalog] = await Promise.all([getJobDetail(jobId), getJobResults(jobId), getJobExportCatalog(jobId)]);
        if (!active) return;
        const mergedJob = { ...(jobDetail.summary ?? {}), ...(jobDetail.job ?? {}) } as JobRecord;
        setJobMeta({
          filename: pickString(mergedJob, ['display_name', 'displayName', 'campaign_name', 'file_name', 'original_filename']),
          createdAt: pickString(mergedJob, ['created_at', 'createdAt', 'created', 'timestamp']),
        });
        setResults(jobResults);
        setExportCatalog(normalizeExportCatalog(catalog));
      } catch (err) {
        if (!active) return;
        const message = (err as Error).message ?? 'Unable to load job details.';
        setError(message);
        setExportCatalog(FALLBACK_EXPORT_CATALOG);
        showToast({ title: message, variant: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [jobId, showToast]);

  useEffect(() => {
    setResultsPage(1);
  }, [activeTab, resultsPageSize]);

  const parseSummary = (results?.summary ?? null) as ParseSummary | null;
  const rowResults = useMemo(() => results?.row_results ?? [], [results]);
  const canonicalAddresses = useMemo(
    () => (results?.canonical_addresses ?? []).map(normalizeCanonicalAddress),
    [results],
  );

  const needsReviewRows = useMemo(() => rowResults.filter(isNeedsReviewRow), [rowResults]);
  const outOfScopeRows = useMemo(() => rowResults.filter(isOutOfScopeRow), [rowResults]);
  const skippedRows = useMemo(() => rowResults.filter(isSkippedRow), [rowResults]);
  const duplicateRows = useMemo(() => rowResults.filter((row) => row.is_duplicate || row.status === 'DUPLICATE'), [rowResults]);

  const needsReviewGroups = useMemo(() => groupRows(needsReviewRows), [needsReviewRows]);
  const outOfScopeGroups = useMemo(() => groupRows(outOfScopeRows), [outOfScopeRows]);
  const skippedGroups = useMemo(() => groupRows(skippedRows), [skippedRows]);
  const duplicateGroups = useMemo(() => groupRows(duplicateRows), [duplicateRows]);

  const tabCounts: Record<ResultsTab, number> = {
    valid: parseSummary?.valid_unique ?? 0,
    needs_review: parseSummary?.unmatched ?? 0,
    out_of_scope: parseSummary?.out_of_scope ?? 0,
    skipped: parseSummary?.skipped ?? 0,
    duplicates: parseSummary?.duplicates ?? 0,
  };

  const totalCountByTab: Record<ResultsTab, number> = {
    valid: canonicalAddresses.length,
    needs_review: needsReviewGroups.length,
    out_of_scope: outOfScopeGroups.length,
    skipped: skippedGroups.length,
    duplicates: duplicateGroups.length,
  };

  const paginate = <T,>(rows: T[]) => rows.slice((resultsPage - 1) * resultsPageSize, resultsPage * resultsPageSize);

  const handleDownload = async (type: JobExportType, label: string) => {
    if (!jobId) return;
    const key = `${jobId}-${type}`;
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await downloadJobExport(jobId, type);
      triggerDownload(result.blob, result.filename);
      showToast({ title: `${label} downloaded`, variant: 'success' });
    } catch (err) {
      const message = (err as Error).message ?? 'Export failed.';
      setError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const renderGroupedRows = (groups: GroupedRow[]) => {
    const pageGroups = paginate(groups);
    return (
      <>
        {pageGroups.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">No rows in this bucket.</div>
        ) : (
          pageGroups.map((group) => {
            const row = group.displayRow;
            const expanded = expandedGroups[group.groupKey] ?? false;
            return (
              <Fragment key={group.groupKey}>
                <tr>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{rowDisplayId(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getInputAddress(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedAddress(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCounty(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCity(row)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{getStatusLabel(row)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{getReasonMetadata(row).label}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.groupKey]: !expanded }))}
                    >
                      {expanded ? 'Hide Rows' : `Show Rows (${group.count})`}
                    </button>
                  </td>
                </tr>
                {expanded && showRaw ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {stringifyPreview(row.raw_row)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })
        )}
      </>
    );
  };

  return (
    <AppShell title="Job Details" subtitle="Review full status datasets and export results.">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/history" className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200">← Back to history</Link>
          <div className="w-full max-w-4xl">
            <ExportPanel
              mode="inline"
              catalog={exportCatalog}
              onDownload={(type, label) => {
                void handleDownload(type, label);
              }}
              activeDownloadType={jobId ? (Object.keys(downloading).find((key) => key.startsWith(`${jobId}-`) && downloading[key])?.slice(jobId.length + 1) as JobExportType | null) : null}
              disabled={!jobId}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading job details...</div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Summary</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{jobMeta?.filename ?? 'Untitled file'} • {formatDateTime(jobMeta?.createdAt ?? null)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {[
                  ['Rows Received', parseSummary?.rows_received],
                  ['Valid Unique', parseSummary?.valid_unique],
                  ['Needs Review', parseSummary?.unmatched],
                  ['Out Of Scope', parseSummary?.out_of_scope],
                  ['Skipped', parseSummary?.skipped],
                  ['Duplicates', parseSummary?.duplicates],
                  ['Total Cost/Spend', formatCurrency((results?.metadata as Record<string, unknown> | undefined)?.spend_usd as number | undefined)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value ?? '--'}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">{error}</div> : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {([
                ['valid', 'Valid Unique'],
                ['needs_review', 'Needs Review'],
                ['out_of_scope', 'Out Of Scope'],
                ['skipped', 'Skipped'],
                ['duplicates', 'Duplicates'],
              ] as Array<[ResultsTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
                >
                  {label} ({tabCounts[tab]})
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {showRaw ? 'Hide Raw Preview' : 'Show Raw Preview'}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-auto">
              {activeTab === 'valid' ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Full Address</th>
                      <th className="px-4 py-3">Street</th>
                      <th className="px-4 py-3">Address 2</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Zip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginate(canonicalAddresses).length === 0 ? (
                      <tr><td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={6}>No unique valid addresses yet.</td></tr>
                    ) : (
                      paginate(canonicalAddresses).map((row) => (
                        <tr key={row.canonical_id}>
                          <td className="px-4 py-3">{row.fullAddress || row.formatted_address || '--'}</td>
                          <td className="px-4 py-3">{row.street1 || '--'}</td>
                          <td className="px-4 py-3">{row.street2 || '--'}</td>
                          <td className="px-4 py-3">{row.city || '--'}</td>
                          <td className="px-4 py-3">{row.state || '--'}</td>
                          <td className="px-4 py-3">{row.zip || '--'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Record ID/Row</th>
                      <th className="px-4 py-3">Original Address</th>
                      <th className="px-4 py-3">Matched Address</th>
                      <th className="px-4 py-3">Matched County</th>
                      <th className="px-4 py-3">Matched City</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeTab === 'needs_review' ? renderGroupedRows(needsReviewGroups) : null}
                    {activeTab === 'out_of_scope' ? renderGroupedRows(outOfScopeGroups) : null}
                    {activeTab === 'skipped' ? renderGroupedRows(skippedGroups) : null}
                    {activeTab === 'duplicates' ? renderGroupedRows(duplicateGroups) : null}
                  </tbody>
                </table>
              )}
            </div>
            <TablePagination
              totalCount={totalCountByTab[activeTab]}
              page={resultsPage}
              pageSize={resultsPageSize}
              onPageChange={setResultsPage}
              onPageSizeChange={setResultsPageSize}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
