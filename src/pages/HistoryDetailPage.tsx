import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthControls } from '../App';
import AppShell from '../components/AppShell';
import TablePagination from '../components/TablePagination';
import InternalCostPanel from '../components/InternalCostPanel';
import { downloadJobExport, getJobDetail, getJobExportCatalog, getJobResults, JobExportType, JobRecord, updateJobMetadata } from '../lib/api';

import { groupRows, GroupedRow } from '../lib/groupRows';
import {
  getReasonMetadata,
  getCompareInputDisplay,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  stringifyPreview,
  getDisplaySafeMatchedAddress,
  getResolverDetails,
  getReviewDebugHint,
  getReviewExplanation,
  getReviewReasonBucket,
  shouldShowOneCandidateBadge,
  type ReviewReasonFilter,
  buildLocalCsvForExport,
  isHeaderOnlyCsv,
  isTemporaryResultsUnavailableError,
} from '../lib/parseUtils';
import { useToast } from '../components/ui/ToastProvider';
import ExportPanel from '../components/exports/ExportPanel';
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import { deriveDisplayedParseSummary, normalizeJobSummary, toParseSummary } from '../lib/jobSummary';
import type { ExportCatalogItem } from '../types/exports';
import type { CanonicalAddress, RowResult } from '../types/parse';
import { subscribeJobUpdates } from '../lib/liveUpdates';

const RESULTS_RETRY_MAX_ATTEMPTS = 6;
const RESULTS_RETRY_BASE_DELAY_MS = 800;

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

const pickNumber = (job: JobRecord, keys: string[]) => {
  const value = pickValue(job, keys);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatCurrency = (value?: number | null) => {
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
const getMatchedAddress = (row: RowResult) => getDisplaySafeMatchedAddress(row) || '—';
const getMatchedCounty = (row: RowResult) => {
  const components = (row.components ?? {}) as Record<string, unknown>;
  return (components.county as string) || (components.matched_county as string) || '—';
};
const getMatchedCity = (row: RowResult) => {
  const components = (row.components ?? {}) as Record<string, unknown>;
  return row.formatted_address?.split(',')?.[1]?.trim() || row.detected_address?.split(',')?.[1]?.trim() || (components.city as string) || '—';
};
const getStatusLabel = (row: RowResult) => row.status || '--';

const renderOriginalAddressCell = (row: RowResult) => {
  const compareInput = getCompareInputDisplay(row);
  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-700 dark:text-slate-200">{compareInput.original || '--'}</div>
      {compareInput.showNormalized ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Compared as:</span>{' '}
          {compareInput.normalized}
        </div>
      ) : null}
    </div>
  );
};

const formatCount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount.toLocaleString() : null;
};

export default function HistoryDetailPage() {
  const { role } = useAuthControls();
  const isPrivileged = role === 'admin' || role === 'owner';
  const { showToast } = useToast();
  const { jobId } = useParams();

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [exportCatalog, setExportCatalog] = useState<ExportCatalogItem[]>(FALLBACK_EXPORT_CATALOG);
  const [activeTab, setActiveTab] = useState<ResultsTab>('valid');
  const [showRaw, setShowRaw] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(10);
  const [reviewReasonFilter, setReviewReasonFilter] = useState<ReviewReasonFilter>('all');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [jobMeta, setJobMeta] = useState<JobSummaryMeta | null>(null);
  const [mergedJobSummary, setMergedJobSummary] = useState<JobRecord | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof getJobResults>> | null>(null);
  const [resultsFinalizing, setResultsFinalizing] = useState(false);
  const hasLoadedDetailRef = useRef(false);

  const hydrateResultsWithRetry = useCallback(async () => {
    if (!jobId) return;
    for (let attempt = 0; attempt < RESULTS_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const jobResults = await getJobResults(jobId, { fresh: true });
        setResults(jobResults);
        setMergedJobSummary((prev) => ({ ...(prev ?? {}), ...((jobResults.summary ?? {}) as JobRecord) }));
        setResultsFinalizing(false);
        return;
      } catch (err) {
        if (!isTemporaryResultsUnavailableError(err)) {
          throw err;
        }
        setResultsFinalizing(true);
        await new Promise((resolve) => window.setTimeout(resolve, RESULTS_RETRY_BASE_DELAY_MS * 2 ** attempt));
      }
    }
  }, [jobId]);

  const loadDetails = useCallback(async () => {
    if (!jobId) return;
    const hasExistingSummary = hasLoadedDetailRef.current;
    if (hasExistingSummary) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);
    try {
      const [jobDetail, catalog] = await Promise.all([getJobDetail(jobId), getJobExportCatalog(jobId)]);
      const mergedJob = {
        ...(jobDetail.summary ?? {}),
        ...(jobDetail.job ?? {}),
      } as JobRecord;
      setMergedJobSummary(mergedJob);
      hasLoadedDetailRef.current = true;
      setJobMeta({
        filename: pickString(mergedJob, ['display_name', 'displayName', 'campaign_name', 'file_name', 'original_filename']),
        createdAt: pickString(mergedJob, ['created_at', 'createdAt', 'created', 'timestamp']),
      });
      setCampaignDraft(pickString(mergedJob, ['campaign_name', 'display_name', 'displayName']) ?? '');
      setExportCatalog(normalizeExportCatalog(catalog));
      setResultsFinalizing(true);
      setInitialLoading(false);
      void hydrateResultsWithRetry().catch((resultsError) => {
        const message = (resultsError as Error).message ?? 'Unable to load job results.';
        setResultsFinalizing(false);
        if (!(results?.row_results?.length ?? 0)) {
          setError(message);
          showToast({ title: message, variant: 'error' });
        }
      }).finally(() => {
        setRefreshing(false);
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to load job details.';
      setError(message);
      setExportCatalog(FALLBACK_EXPORT_CATALOG);
      setInitialLoading(false);
      setRefreshing(false);
      showToast({ title: message, variant: 'error' });
    }
  }, [hydrateResultsWithRetry, jobId, results, showToast]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    const unsubscribe = subscribeJobUpdates((event) => {
      if (event.jobId && jobId && event.jobId !== jobId) return;
      void loadDetails();
    });
    return unsubscribe;
  }, [jobId, loadDetails]);

  useEffect(() => {
    const onFocus = () => {
      void loadDetails();
    };
    const onVisibility = () => {
      if (!document.hidden) {
        void loadDetails();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadDetails]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void loadDetails();
      }
    }, 25000);
    return () => window.clearInterval(timer);
  }, [loadDetails]);

  useEffect(() => {
    setResultsPage(1);
  }, [activeTab, resultsPageSize]);

  const rowResults = useMemo(() => results?.row_results ?? [], [results]);

  const parseSummary = useMemo(() => {
    const backendSummary = mergedJobSummary ? toParseSummary(normalizeJobSummary(mergedJobSummary)) : null;
    return deriveDisplayedParseSummary(rowResults, backendSummary);
  }, [mergedJobSummary, rowResults]);

  const totalCost = useMemo(() => {
    const fromParseSummary = parseSummary?.spend_usd;
    const fromResultsSummary = pickNumber((results?.summary ?? {}) as JobRecord, ['spend_usd', 'spendUsd']);
    const fromJobSummary = pickNumber((mergedJobSummary ?? {}) as JobRecord, ['spend_usd', 'spendUsd']);
    return fromParseSummary ?? fromResultsSummary ?? fromJobSummary;
  }, [mergedJobSummary, parseSummary, results?.summary]);

  const costPanelItems = useMemo(
    () =>
      isPrivileged
        ? [
            { label: 'Estimated job cost', value: formatCurrency(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['estimated_job_cost_usd']) ?? totalCost) },
            { label: 'Estimated monthly total', value: formatCurrency(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['estimated_monthly_total_usd', 'estimated_monthly_cost_usd'])) },
            { label: 'Geocoding calls', value: formatCount(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['geocoding_calls', 'google_calls_used'])) },
            { label: 'Autocomplete calls', value: formatCount(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['autocomplete_calls'])) },
            { label: 'Place details calls', value: formatCount(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['place_details_calls'])) },
            { label: 'OCR/AI token usage', value: formatCount(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['ai_token_usage', 'input_tokens', 'output_tokens'])) },
            { label: 'Remaining free-cap estimate', value: formatCurrency(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['remaining_free_cap_estimate_usd', 'remaining_free_cap_estimate'])) },
            { label: 'Reconciliation status', value: pickString((mergedJobSummary ?? {}) as JobRecord, ['reconciliation_status']) },
          ]
        : [
            { label: 'Estimated cost', value: formatCurrency(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['estimated_job_cost_usd']) ?? totalCost) },
            { label: 'Credits used', value: formatCount(pickNumber((mergedJobSummary ?? {}) as JobRecord, ['credits_used'])) },
          ],
    [isPrivileged, mergedJobSummary, totalCost],
  );

  const canonicalAddresses = useMemo(
    () => (results?.canonical_addresses ?? []).map(normalizeCanonicalAddress),
    [results],
  );

  const needsReviewRows = useMemo(() => rowResults.filter(isNeedsReviewRow), [rowResults]);
  const outOfScopeRows = useMemo(() => rowResults.filter(isOutOfScopeRow), [rowResults]);
  const skippedRows = useMemo(() => rowResults.filter(isSkippedRow), [rowResults]);
  const duplicateRows = useMemo(() => rowResults.filter((row) => row.is_duplicate || row.status === 'DUPLICATE'), [rowResults]);

  const needsReviewGroups = useMemo(() => groupRows(needsReviewRows), [needsReviewRows]);
  const filteredNeedsReviewGroups = useMemo(() => {
    if (reviewReasonFilter === 'all') return needsReviewGroups;
    return needsReviewGroups.filter((group) => getReviewReasonBucket(group.displayRow) === reviewReasonFilter);
  }, [needsReviewGroups, reviewReasonFilter]);
  const reviewBreakdown = useMemo(() => {
    const buckets = { route_alias: 0, missing_street_number: 0, house_number: 0, county_rescue: 0, low_precision: 0, other: 0 };
    needsReviewGroups.forEach((group) => {
      const bucket = getReviewReasonBucket(group.displayRow);
      if (bucket === 'all') buckets.other += group.count;
      else (buckets as Record<string, number>)[bucket] += group.count;
    });
    return buckets;
  }, [needsReviewGroups]);
  const outOfScopeGroups = useMemo(() => groupRows(outOfScopeRows), [outOfScopeRows]);
  const skippedGroups = useMemo(() => groupRows(skippedRows), [skippedRows]);
  const duplicateGroups = useMemo(() => groupRows(duplicateRows), [duplicateRows]);

  const tabCounts: Record<ResultsTab, number> = {
    valid: parseSummary?.valid_unique ?? 0,
    needs_review: filteredNeedsReviewGroups.length,
    out_of_scope: parseSummary?.out_of_scope ?? 0,
    skipped: parseSummary?.skipped ?? 0,
    duplicates: parseSummary?.duplicates ?? 0,
  };

  const totalCountByTab: Record<ResultsTab, number> = {
    valid: canonicalAddresses.length,
    needs_review: filteredNeedsReviewGroups.length,
    out_of_scope: outOfScopeGroups.length,
    skipped: skippedGroups.length,
    duplicates: duplicateGroups.length,
  };

  const paginate = <T,>(rows: T[]) => rows.slice((resultsPage - 1) * resultsPageSize, resultsPage * resultsPageSize);

  const exportCatalogByType = useMemo(() => new Map(exportCatalog.map((item) => [item.type, item])), [exportCatalog]);
  const hasVisibleRows = rowResults.length > 0 || canonicalAddresses.length > 0;
  const exportIntegrityWarningVisible = useMemo(() => {
    if (!hasVisibleRows) return false;
    const monitoredTypes: JobExportType[] = ['processing_report', 'unique_valid', 'needs_review', 'out_of_scope', 'duplicates', 'skipped'];
    return monitoredTypes.some((type) => (exportCatalogByType.get(type)?.rowCount ?? 1) === 0);
  }, [exportCatalogByType, hasVisibleRows]);

  const handleDownload = async (type: JobExportType, label: string) => {
    if (!jobId) return;
    const key = `${jobId}-${type}`;
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await downloadJobExport(jobId, type);
      const csvText =
        type === 'original_file' || type === 'propstream_import'
          ? ''
          : typeof result.blob.text === 'function'
            ? await result.blob.text()
            : '';
      const catalogItem = exportCatalogByType.get(type);
      const shouldFallback =
        (type === 'processing_report' ||
          type === 'unique_valid' ||
          type === 'needs_review' ||
          type === 'out_of_scope' ||
          type === 'duplicates' ||
          type === 'skipped') &&
        (isHeaderOnlyCsv(csvText) || ((catalogItem?.rowCount ?? 1) === 0 && hasVisibleRows));

      if (shouldFallback) {
        const fallbackBlob = buildLocalCsvForExport(type, {
          rowResults,
          canonicalAddresses,
        });
        triggerDownload(fallbackBlob, `job-${jobId}-${type}-local-fallback.csv`);
        showToast({ title: 'Used local export fallback', variant: 'info' });
      } else {
        triggerDownload(result.blob, result.filename);
      }
      showToast({
        title: type === 'original_file' ? 'Original upload downloaded' : `${label} downloaded`,
        variant: 'success',
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Export failed.';
      setError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveCampaignName = async () => {
    if (!jobId) return;
    const nextName = campaignDraft.trim();
    const previousSummary = mergedJobSummary;
    setSavingCampaign(true);
    setMergedJobSummary((prev) => ({ ...(prev ?? {}), campaign_name: nextName, display_name: nextName || 'Untitled job' }));
    setJobMeta((prev) => (prev ? { ...prev, filename: nextName || prev.filename } : prev));
    try {
      await updateJobMetadata(jobId, { campaignName: nextName });
      showToast({ title: 'Campaign name updated', variant: 'success' });
    } catch (err) {
      setMergedJobSummary(previousSummary);
      showToast({ title: (err as Error).message ?? 'Unable to update campaign name.', variant: 'error' });
    } finally {
      setSavingCampaign(false);
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
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{rowDisplayId(row)}
                    {group.count > 1 ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.count} rows affected</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{renderOriginalAddressCell(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedAddress(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCounty(row)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCity(row)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{getStatusLabel(row)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    <div className="space-y-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{getReviewExplanation(row) || getReasonMetadata(row).label}</span>
                      {shouldShowOneCandidateBadge(row) ? (
                        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          One candidate found
                        </span>
                      ) : null}
                      {getReviewDebugHint(row) ? (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{getReviewDebugHint(row)}</p>
                      ) : null}
                      {getResolverDetails(row).length ? (
                        <details className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-[11px] text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300">
                          <summary className="cursor-pointer list-none font-medium text-slate-600 marker:hidden dark:text-slate-200">Internal diagnostics</summary>
                          <div className="mt-2 grid gap-1.5">
                            {getResolverDetails(row).map((detail) => (
                              <div key={`${detail.label}-${detail.value}`} className="flex flex-wrap gap-1">
                                <span className="font-semibold text-slate-500 dark:text-slate-400">{detail.label}:</span>
                                <span>{detail.value}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </td>
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
          <div className="flex flex-col items-end gap-2">
            {exportIntegrityWarningVisible ? (
              <p className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                Saved export rows are unavailable for this run. Downloads may be incomplete until backend persistence is repaired.
              </p>
            ) : null}
            <ExportPanel
              catalog={exportCatalog}
              onDownload={(type, label) => {
                void handleDownload(type, label);
              }}
              activeDownloadType={jobId ? (Object.keys(downloading).find((key) => key.startsWith(`${jobId}-`) && downloading[key])?.slice(jobId.length + 1) as JobExportType | null) : null}
              disabled={!jobId}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Campaign name</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                aria-label="Edit campaign name"
                value={campaignDraft}
                onChange={(event) => setCampaignDraft(event.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => void saveCampaignName()}
                disabled={savingCampaign}
              >
                {savingCampaign ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </div>
          <InternalCostPanel
            title={isPrivileged ? 'Internal cost transparency' : 'Usage estimate'}
            subtitle={isPrivileged ? 'Internal-only testing and reconciliation fields.' : 'Product-safe estimate only.'}
            items={costPanelItems}
            isPrivileged={isPrivileged}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {initialLoading && !mergedJobSummary ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading job details...</div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Summary</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{jobMeta?.filename ?? 'Untitled file'} • {formatDateTime(jobMeta?.createdAt ?? null)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {[
                  ['Rows Received', parseSummary?.rows_received],
                  ['Unique Valid', parseSummary?.valid_unique],
                  ['Out Of Scope', parseSummary?.out_of_scope],
                  ['Skipped', parseSummary?.skipped],
                  ['Duplicates', parseSummary?.duplicates],
                  ['Total Cost', formatCurrency(totalCost)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value ?? '--'}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Needs Review Issues</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{needsReviewGroups.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{needsReviewRows.length} rows</p>
                </div>
              </div>
            </>
          )}
          {refreshing ? <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p> : null}
          {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">{error}</div> : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {([
                ['valid', 'Unique Valid'],
                ['needs_review', 'Needs Review'],
                ['out_of_scope', 'Out Of Scope (rows)'],
                ['skipped', 'Skipped (rows)'],
                ['duplicates', 'Duplicates (rows)'],
              ] as Array<[ResultsTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
                >
                  {tab === 'needs_review'
                    ? `${label} (${needsReviewGroups.length} issues · ${needsReviewRows.length} rows)`
                    : `${label} (${tabCounts[tab]})${tab !== 'valid' ? ` · ${totalCountByTab[tab]} groups` : ''}`}
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

          {activeTab === 'needs_review' ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Grouped by issue so repeated copies do not inflate workload.</p>
              {needsReviewRows.some((row) => row.resolver_strategy || row.decision_tier || row.candidate_count_in_scope !== undefined) ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Only unresolved or ambiguous candidates remain in review.</p>
              ) : null}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Route Alias / Route Mismatch: {reviewBreakdown.route_alias}</span>
                  <span>Street Number Not Verified: {reviewBreakdown.missing_street_number}</span>
                  <span>House Number Mismatch: {reviewBreakdown.house_number}</span>
                  <span>County Rescue Needed: {reviewBreakdown.county_rescue}</span>
                  <span>Low Precision: {reviewBreakdown.low_precision}</span>
                  <span>Other: {reviewBreakdown.other}</span>
                </div>
              </div>
              <select
                aria-label="Needs review reason filter"
                value={reviewReasonFilter}
                onChange={(event) => setReviewReasonFilter(event.target.value as ReviewReasonFilter)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">All</option>
                <option value="route_alias">Route Alias</option>
                <option value="house_number">House Number</option>
                <option value="low_precision">Low Precision</option>
                <option value="county_rescue">County Rescue</option>
                <option value="missing_street_number">Missing Street Number</option>
              </select>
            </div>
          ) : null}

          {resultsFinalizing ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Results are finalizing… row tables will appear automatically.</p>
          ) : null}
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
                    {activeTab === 'needs_review' ? renderGroupedRows(filteredNeedsReviewGroups) : null}
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
              perPageLabel={activeTab === 'needs_review' ? "Issues per page" : undefined}
              rangeContext={activeTab === 'needs_review' ? `issues · ${needsReviewRows.length} rows` : undefined}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
