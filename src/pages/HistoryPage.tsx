import { CSSProperties, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthControls } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import Badge from '../components/ui/Badge';
import { getBadgeVariant } from '../components/ui/badgeVariant';
import Button from '../components/ui/Button';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { downloadJobExport, getJobExportCatalog, JobExportType, JobRecord, getJobs, updateJobMetadata } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import ExportPanel from '../components/exports/ExportPanel';
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import { normalizeJobSummary } from '../lib/jobSummary';
import { flattenUsageSummary } from '../lib/usageSummary';
import { readLocalParsePersistenceState } from '../lib/persistenceStatus';
import type { ExportCatalogItem } from '../types/exports';
import { subscribeJobUpdates } from '../lib/liveUpdates';
import { formatHistoryRowCost } from '../lib/costTelemetry';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { groupJobsByBatch } from '../lib/batchGrouping';

type StatusFilter = 'ALL' | 'DONE' | 'RUNNING' | 'FAILED';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const twoLineClampStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const pick = (job: JobRecord, keys: string[]) => {
  for (const key of keys) {
    const value = job[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
};

const pickString = (job: JobRecord, keys: string[]) => {
  const value = pick(job, keys);
  return typeof value === 'string' ? value : value != null ? String(value) : null;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const parsePositiveInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeStatus = (raw: string | null): 'RUNNING' | 'DONE' | 'FAILED' => {
  if (!raw) return 'RUNNING';
  const status = raw.toUpperCase();
  if (status.includes('FAIL')) return 'FAILED';
  if (status.includes('DONE') || status.includes('COMPLETE') || status.includes('SUCCESS')) return 'DONE';
  return 'RUNNING';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuthControls();
  const isPrivileged = role === 'admin' || role === 'owner';
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const rawStatus = (searchParams.get('status') ?? 'ALL').toUpperCase();
    return (['ALL', 'DONE', 'RUNNING', 'FAILED'] as const).includes(rawStatus as StatusFilter)
      ? (rawStatus as StatusFilter)
      : 'ALL';
  });
  const [page, setPage] = useState(() => parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(() => parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE));
  const [totalCount, setTotalCount] = useState(0);
  const [catalogByJobId, setCatalogByJobId] = useState<Record<string, ExportCatalogItem[]>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [localParsePersistenceWarning, setLocalParsePersistenceWarning] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const hasLoadedJobsRef = useRef(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) nextParams.set('search', debouncedSearch.trim());
    else nextParams.delete('search');

    if (statusFilter !== 'ALL') nextParams.set('status', statusFilter);
    else nextParams.delete('status');

    if (page > 1) nextParams.set('page', String(page));
    else nextParams.delete('page');

    if (pageSize !== DEFAULT_PAGE_SIZE) nextParams.set('pageSize', String(pageSize));
    else nextParams.delete('pageSize');

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [page, pageSize, debouncedSearch, searchParams, setSearchParams, statusFilter]);

  const loadJobs = useCallback(async () => {
    const hasExistingJobs = hasLoadedJobsRef.current;
    if (hasExistingJobs) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);
    try {
      const response = await getJobs({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setJobs(response.items ?? []);
      setTotalCount(response.totalCount ?? 0);
      hasLoadedJobsRef.current = true;
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to load history.';
      setError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, debouncedSearch, showToast, statusFilter]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const state = readLocalParsePersistenceState();
    setLocalParsePersistenceWarning(Boolean(state?.persistenceWarning));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeJobUpdates(() => {
      void loadJobs();
    });
    return unsubscribe;
  }, [loadJobs]);

  useEffect(() => {
    const onFocus = () => {
      void loadJobs();
    };
    const onVisibility = () => {
      if (!document.hidden) {
        void loadJobs();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadJobs]);

  const rows = useMemo(
    () =>
      jobs.map((job) => {
        const summary = normalizeJobSummary(job);
        const usageSummary = flattenUsageSummary(job);
        const state = pickString(job, ['state']);
        const county = pickString(job, ['county']);
        const city = pickString(job, ['city']);
        return {
          id: pickString(job, ['job_id', 'jobId', 'id']) ?? '',
          hasId: Boolean(pickString(job, ['job_id', 'jobId', 'id'])),
          status: normalizeStatus(pickString(job, ['status', 'job_status', 'state'])),
          createdAt: pickString(job, ['created_at', 'createdAt', 'created']),
          name: pickString(job, ['display_name', 'displayName', 'campaign_name']) ?? 'Untitled job',
          filename: pickString(job, ['file_name', 'fileName', 'original_filename', 'filename']) ?? '--',
          location: [state, county, city].filter(Boolean).join(' / ') || '--',
          rowsReceived: summary.rowsReceived,
          validUnique: summary.validUnique,
          needsReview: summary.needsReview,
          outOfScope: summary.outOfScope,
          skipped: summary.skipped,
          duplicates: summary.duplicates,
          spendUsd: summary.spendUsd ?? null,
          estimatedJobCost: usageSummary.estimated_job_cost_usd ?? pick(job, ['estimated_job_cost_usd', 'estimatedJobCostUsd']) ?? null,
          batchId: pickString(job, ['batch_id', 'batchId']) ?? null,
        };
      }),
    [jobs],
  );

  const groupedEntries = useMemo(() => groupJobsByBatch(rows), [rows]);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  useEffect(() => {
    if (!rows.some((row) => row.status === 'RUNNING')) return;
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [rows, loadJobs]);

  const ensureExportCatalog = async (jobId: string) => {
    if (!jobId || catalogByJobId[jobId]) return;
    try {
      const catalog = await getJobExportCatalog(jobId);
      setCatalogByJobId((prev) => ({ ...prev, [jobId]: normalizeExportCatalog(catalog) }));
    } catch {
      setCatalogByJobId((prev) => ({ ...prev, [jobId]: FALLBACK_EXPORT_CATALOG }));
    }
  };

  const getRowActiveDownloadType = (jobId: string) => {
    const activeKey = Object.keys(downloading).find((key) => key.startsWith(`${jobId}:`) && downloading[key]);
    return activeKey ? (activeKey.split(':')[1] as JobExportType) : null;
  };

  const handleDownload = async (jobId: string, type: JobExportType, label: string) => {
    const key = `${jobId}:${type}`;
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await downloadJobExport(jobId, type);
      triggerDownload(result.blob, result.filename);
      showToast({ title: `${label} downloaded`, variant: 'success' });
    } catch (err) {
      showToast({ title: (err as Error).message ?? 'Export failed.', variant: 'error' });
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const beginEditCampaign = (jobId: string, currentName: string) => {
    setEditingJobId(jobId);
    setCampaignDraft(currentName === 'Untitled job' ? '' : currentName);
  };

  const saveCampaignName = async () => {
    if (!editingJobId) return;
    const nextName = campaignDraft.trim();
    setSavingCampaign(true);
    const previousJobs = jobs;
    setJobs((prev) =>
      prev.map((job) =>
        pickString(job, ['job_id', 'jobId', 'id']) === editingJobId
          ? { ...job, campaign_name: nextName, display_name: nextName || 'Untitled job' }
          : job,
      ),
    );
    try {
      await updateJobMetadata(editingJobId, { campaignName: nextName });
      showToast({ title: 'Campaign name updated', variant: 'success' });
      setEditingJobId(null);
    } catch (err) {
      setJobs(previousJobs);
      showToast({ title: (err as Error).message ?? 'Unable to update campaign name.', variant: 'error' });
    } finally {
      setSavingCampaign(false);
    }
  };

  const hasAnyJobs = rows.length > 0;
  const hasFilterResults = totalCount > 0;
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, page * pageSize);

  return (
    <AppShell title="History" subtitle="Review and export previous parse jobs.">
      <Card>
        <SectionHeader
          title="Job history"
          subtitle="Accessible jobs feed with real-time status updates for running work."
          action={<Button onClick={() => void loadJobs()}>Refresh</Button>}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(['ALL', 'DONE', 'RUNNING', 'FAILED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusFilter === status ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {status === 'ALL' ? 'All' : status[0] + status.slice(1).toLowerCase()}
            </button>
          ))}
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search job name or file"
            className="ml-auto w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        {initialLoading && !hasAnyJobs ? (
          <EmptyState className="mt-6" title="Loading history" description="Loading job history..." />
        ) : error && !hasAnyJobs ? (
          <EmptyState className="mt-6" title="History unavailable" description={error} />
        ) : !hasAnyJobs ? (
          localParsePersistenceWarning ? (
            <EmptyState
              className="mt-6"
              title="No persisted jobs yet"
              description="Your last run completed, but it was not saved to History."
              actionLabel="Parse"
              onAction={() => navigate('/parse')}
            />
          ) : (
            <EmptyState className="mt-6" title="No jobs yet" description="Upload a file to run your first parsing job." actionLabel="Parse" onAction={() => navigate('/parse')} />
          )
        ) : !hasFilterResults ? (
          <EmptyState className="mt-6" title="No jobs in this filter" description="Try another status tab." />
        ) : rows.length === 0 ? (
          <EmptyState className="mt-6" title="No jobs matching search" description="Adjust the search query." />
        ) : (
          <>
            {refreshing ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div>
                Showing {pageStart}–{pageEnd} of {totalCount} jobs
              </div>
              <label className="flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  aria-label="Rows per page"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Job</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Rows Received</th>
                      <th className="px-4 py-3 text-right">Unique Valid</th>
                      <th className="px-4 py-3 text-right">Needs Review</th>
                      <th className="px-4 py-3 text-right">Out of Scope</th>
                      <th className="px-4 py-3 text-right">Skipped</th>
                      <th className="px-4 py-3 text-right">Duplicates</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">Export</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupedEntries.map((entry) => (
                      entry.type === 'standalone' ? (
                      <tr key={entry.row.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => entry.row.hasId && navigate(`/history/${entry.row.id}`)}>
                        <td className="px-4 py-2.5">{formatDateTime(entry.row.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium" style={twoLineClampStyle}>{entry.row.name}</div>
                          <div className="text-xs text-slate-500" style={twoLineClampStyle}>{entry.row.filename}</div>
                        </td>
                        <td className="px-4 py-2.5">{entry.row.location}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.rowsReceived}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.validUnique}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.needsReview}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.outOfScope}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.skipped}</td>
                        <td className="px-4 py-2.5 text-right">{entry.row.duplicates}</td>
                        <td className="px-4 py-2.5"><Badge variant={getBadgeVariant(entry.row.status)}>{entry.row.status}</Badge></td>
                        <td className="px-4 py-2.5 text-right">
                          <div>{formatHistoryRowCost(entry.row.estimatedJobCost ?? entry.row.spendUsd)}</div>
                          {isPrivileged && entry.row.estimatedJobCost !== null && entry.row.spendUsd !== entry.row.estimatedJobCost ? (
                            <div className="text-[11px] text-slate-400">Actual {formatHistoryRowCost(entry.row.spendUsd)}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right" onClick={(event) => { event.stopPropagation(); void ensureExportCatalog(entry.row.id); }}>
                          <ExportPanel
                            triggerLabel="Export"
                            className="relative inline-block text-left"
                            catalog={catalogByJobId[entry.row.id] ?? FALLBACK_EXPORT_CATALOG}
                            onDownload={(type, label) => void handleDownload(entry.row.id, type, label)}
                            activeDownloadType={getRowActiveDownloadType(entry.row.id)}
                            disabled={!entry.row.hasId}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                          <Button type="button" variant="ghost" size="sm" onClick={() => beginEditCampaign(entry.row.id, entry.row.name)} disabled={!entry.row.hasId}>
                            Edit name
                          </Button>
                        </td>
                      </tr>
                      ) : (
                        <Fragment key={`batch-group-${entry.batchId}`}>
                          <tr
                            key={`batch-${entry.batchId}`}
                            className="cursor-pointer bg-indigo-50/50 hover:bg-indigo-100/40 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30"
                            onClick={() => toggleBatch(entry.batchId)}
                          >
                            <td className="px-4 py-2.5">{formatDateTime(entry.createdAt)}</td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{expandedBatches.has(entry.batchId) ? '▾' : '▸'} 📦 {entry.name}</div>
                              <div className="text-xs text-slate-500">{entry.rows.length} jobs in batch</div>
                            </td>
                            <td className="px-4 py-2.5">{entry.rows[0]?.location ?? '--'}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.rowsReceived, 0)}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.validUnique, 0)}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.needsReview, 0)}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.outOfScope, 0)}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.skipped, 0)}</td>
                            <td className="px-4 py-2.5 text-right">{entry.rows.reduce((sum, row) => sum + row.duplicates, 0)}</td>
                            <td className="px-4 py-2.5"><Badge variant={getBadgeVariant(entry.status)}>{entry.status}</Badge></td>
                            <td className="px-4 py-2.5 text-right">{formatHistoryRowCost(entry.rows.reduce((sum, row) => sum + (row.estimatedJobCost ?? row.spendUsd ?? 0), 0))}</td>
                            <td className="px-4 py-2.5 text-right" />
                            <td className="px-4 py-2.5 text-right" />
                          </tr>
                          {expandedBatches.has(entry.batchId)
                            ? entry.rows.map((row) => (
                              <tr key={row.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => row.hasId && navigate(`/history/${row.id}`)}>
                                <td className="px-4 py-2.5 pl-8">{formatDateTime(row.createdAt)}</td>
                                <td className="px-4 py-2.5">
                                  <div className="font-medium" style={twoLineClampStyle}>{row.name}</div>
                                  <div className="text-xs text-slate-500" style={twoLineClampStyle}>{row.filename}</div>
                                </td>
                                <td className="px-4 py-2.5">{row.location}</td>
                                <td className="px-4 py-2.5 text-right">{row.rowsReceived}</td>
                                <td className="px-4 py-2.5 text-right">{row.validUnique}</td>
                                <td className="px-4 py-2.5 text-right">{row.needsReview}</td>
                                <td className="px-4 py-2.5 text-right">{row.outOfScope}</td>
                                <td className="px-4 py-2.5 text-right">{row.skipped}</td>
                                <td className="px-4 py-2.5 text-right">{row.duplicates}</td>
                                <td className="px-4 py-2.5"><Badge variant={getBadgeVariant(row.status)}>{row.status}</Badge></td>
                                <td className="px-4 py-2.5 text-right">{formatHistoryRowCost(row.estimatedJobCost ?? row.spendUsd)}</td>
                                <td className="px-4 py-2.5 text-right" onClick={(event) => { event.stopPropagation(); void ensureExportCatalog(row.id); }}>
                                  <ExportPanel triggerLabel="Export" className="relative inline-block text-left" catalog={catalogByJobId[row.id] ?? FALLBACK_EXPORT_CATALOG} onDownload={(type, label) => void handleDownload(row.id, type, label)} activeDownloadType={getRowActiveDownloadType(row.id)} disabled={!row.hasId} />
                                </td>
                                <td className="px-4 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => beginEditCampaign(row.id, row.name)} disabled={!row.hasId}>Edit name</Button>
                                </td>
                              </tr>
                            ))
                            : null}
                        </Fragment>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Button type="button" variant="ghost" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page <= 1}>
                Prev
              </Button>
              <span aria-live="polite">Page {page} of {totalPages}</span>
              <Button type="button" variant="ghost" onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
            {editingJobId ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-950">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit campaign name</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update the product-facing name shown in History.</p>
                  <input
                    aria-label="Campaign name"
                    value={campaignDraft}
                    onChange={(event) => setCampaignDraft(event.target.value)}
                    className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setEditingJobId(null)} disabled={savingCampaign}>Cancel</Button>
                    <Button type="button" onClick={() => void saveCampaignName()} disabled={savingCampaign}>
                      {savingCampaign ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </AppShell>
  );
}
