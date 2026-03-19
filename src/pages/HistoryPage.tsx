import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthControls } from '../App';
import AppShell from '../components/AppShell';
import Badge, { getBadgeVariant } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { downloadJobExport, getJobExportCatalog, JobExportType, JobRecord, getJobs, updateJobMetadata } from '../lib/api';
import { useToast } from '../components/ui/ToastProvider';
import ExportPanel from '../components/exports/ExportPanel';
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import { normalizeJobSummary } from '../lib/jobSummary';
import { readLocalParsePersistenceState } from '../lib/persistenceStatus';
import type { ExportCatalogItem } from '../types/exports';
import { subscribeJobUpdates } from '../lib/liveUpdates';

type StatusFilter = 'ALL' | 'DONE' | 'RUNNING' | 'FAILED';

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

const formatCurrency = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
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
  const { role } = useAuthControls();
  const isPrivileged = role === 'admin' || role === 'owner';
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [catalogByJobId, setCatalogByJobId] = useState<Record<string, ExportCatalogItem[]>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [localParsePersistenceWarning, setLocalParsePersistenceWarning] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const hasLoadedJobsRef = useRef(false);

  const loadJobs = useCallback(async () => {
    const hasExistingJobs = hasLoadedJobsRef.current;
    if (hasExistingJobs) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);
    try {
      const response = await getJobs();
      setJobs(response ?? []);
      hasLoadedJobsRef.current = true;
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to load history.';
      setError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

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
          estimatedJobCost: pickString(job, ['estimated_job_cost_usd', 'estimatedJobCostUsd']),
        };
      }),
    [jobs],
  );

  const statusCounts = useMemo(
    () => ({
      ALL: rows.length,
      DONE: rows.filter((row) => row.status === 'DONE').length,
      RUNNING: rows.filter((row) => row.status === 'RUNNING').length,
      FAILED: rows.filter((row) => row.status === 'FAILED').length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      const matchesSearch = !term || `${row.filename} ${row.name}`.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    if (!filteredRows.some((row) => row.status === 'RUNNING')) return;
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [filteredRows, loadJobs]);

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
  const hasFilterResults = (statusFilter === 'ALL' ? rows : rows.filter((row) => row.status === statusFilter)).length > 0;

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
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusFilter === status ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {status === 'ALL' ? 'All' : status[0] + status.slice(1).toLowerCase()} ({statusCounts[status]})
            </button>
          ))}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        ) : filteredRows.length === 0 ? (
          <EmptyState className="mt-6" title="No jobs matching search" description="Adjust the search query." />
        ) : (
          <>
            {refreshing ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p>
            ) : null}
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
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => row.hasId && navigate(`/history/${row.id}`)}>
                      <td className="px-4 py-2.5">{formatDateTime(row.createdAt)}</td>
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
                      <td className="px-4 py-2.5 text-right">
                        <div>{formatCurrency(row.spendUsd)}</div>
                        {isPrivileged && row.estimatedJobCost ? (
                          <div className="text-[11px] text-slate-400">Est. {formatCurrency(Number(row.estimatedJobCost))}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(event) => { event.stopPropagation(); void ensureExportCatalog(row.id); }}>
                        <ExportPanel
                          triggerLabel="Export"
                          className="relative inline-block text-left"
                          catalog={catalogByJobId[row.id] ?? FALLBACK_EXPORT_CATALOG}
                          onDownload={(type, label) => void handleDownload(row.id, type, label)}
                          activeDownloadType={getRowActiveDownloadType(row.id)}
                          disabled={!row.hasId}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="ghost" size="sm" onClick={() => beginEditCampaign(row.id, row.name)} disabled={!row.hasId}>
                          Edit name
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
