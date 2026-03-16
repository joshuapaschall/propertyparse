import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Badge, { getBadgeVariant } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { downloadJobExport, getJobExportCatalog, JobExportType, JobRecord, getJobs } from '../lib/api';
import { useToast } from '../components/ui/ToastProvider';
import ExportPanel from '../components/exports/ExportPanel';
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import type { ExportCatalogItem } from '../types/exports';

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

const twoLineClampStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export default function HistoryPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'DONE' | 'RUNNING' | 'FAILED'>('DONE');
  const [catalogByJobId, setCatalogByJobId] = useState<Record<string, ExportCatalogItem[]>>({});

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
          const message = (err as Error).message ?? 'Unable to load history.';
          setError(message);
          showToast({ title: message, variant: 'error' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [showToast]);

  const rows = useMemo(
    () =>
      jobs.map((job) => {
        const jobId = pickString(job, ['job_id', 'jobId', 'id']) ?? '';
        const validUnique = pickNumber(job, ['valid_unique', 'validUnique']);
        const needsReview =
          pickNumber(job, ['needs_review', 'needsReview', 'needs_review_count']) ??
          pickNumber(job, ['unmatched', 'unmatched_count', 'unmatchedCount']);
        const state = pickString(job, ['state']);
        const county = pickString(job, ['county']);
        const city = pickString(job, ['city']);
        const location = [state, county, city].filter(Boolean).join(' / ');
        return {
          jobId,
          hasId: Boolean(jobId),
          timestamp: pickString(job, ['created_at', 'createdAt', 'created', 'timestamp', 'date']),
          name: pickString(job, ['display_name', 'displayName', 'campaign_name']) ?? 'Untitled job',
          filename: pickString(job, [
            'file_name',
            'fileName',
            'original_filename',
            'originalFilename',
            'filename',
            'file',
          ]),
          location: location || '--',
          rowsReceived: pickNumber(job, ['rowsReceived', 'rows_received', 'total_rows', 'rows', 'rowCount']),
          validUnique,
          needsReview,
          outOfScope: pickNumber(job, ['out_of_scope', 'outOfScope', 'out_of_scope_count']),
          skipped: pickNumber(job, ['skipped', 'skipped_count']),
          duplicates: pickNumber(job, ['duplicates', 'duplicates_count']),
          spendUsd: pickNumber(job, ['spend_usd', 'spendUsd']),
          calls: pickNumber(job, ['google_calls_used', 'googleCallsUsed', 'googleCalls', 'apiCallsUsed']),
          status: normalizeStatus(pickString(job, ['status', 'job_status', 'state'])),
        };
      }),
    [jobs],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = row.status === statusFilter;
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

  const handleDownload = async (jobId: string, type: JobExportType, label: string) => {
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



  const getRowActiveDownloadType = (jobId: string): JobExportType | null => {
    const activeKey = Object.keys(downloading).find((key) => key.startsWith(`${jobId}-`) && downloading[key]);
    if (!activeKey) return null;
    return (activeKey.slice(jobId.length + 1) as JobExportType) ?? null;
  };

  const ensureExportCatalog = async (jobId: string) => {
    if (!jobId || catalogByJobId[jobId]) return;
    try {
      const catalog = await getJobExportCatalog(jobId);
      setCatalogByJobId((prev) => ({ ...prev, [jobId]: normalizeExportCatalog(catalog) }));
    } catch {
      setCatalogByJobId((prev) => ({ ...prev, [jobId]: FALLBACK_EXPORT_CATALOG }));
    }
  };

  return (
    <AppShell title="History" subtitle="Review past parsing jobs and export results." contentFullWidth>
      <div className="space-y-6">
        <Card className="w-full">
          <SectionHeader
            title="Parse Jobs"
            subtitle="Track status, costs, and quality metrics for every run."
            action={
            <div className="w-full max-w-sm">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by filename or job name"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            }
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {(['DONE', 'RUNNING', 'FAILED'] as const).map((status) => (
              <Button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                size="sm"
                variant={statusFilter === status ? 'secondary' : 'ghost'}
                className="rounded-full px-3 py-1"
              >
                {status}
              </Button>
            ))}
          </div>

          {loading ? (
            <EmptyState className="mt-6" title="Loading history" description="Loading job history..." />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              className="mt-6"
              title="No jobs yet"
              description="Upload a file to run your first parsing job."
              actionLabel="Upload & parse"
              onAction={() => navigate('/parse')}
            />
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full min-w-[1320px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date/Time</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Rows</th>
                      <th className="px-4 py-3 text-right">Valid Unique</th>
                      <th className="px-4 py-3 text-right">Needs Review</th>
                      <th className="px-4 py-3 text-right">Out Of Scope</th>
                      <th className="px-4 py-3 text-right">Skipped</th>
                      <th className="px-4 py-3 text-right">Duplicates</th>
                      <th className="px-4 py-3 text-right">Spend</th>
                      <th className="px-4 py-3">Calls</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Export</th>
                      <th className="px-2 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRows.map((row, index) => (
                      <tr
                        key={row.jobId || `job-${index}`}
                        className={`group transition ${row.hasId ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900' : 'cursor-default'}`}
                        onClick={() => {
                          if (row.hasId) {
                            navigate(`/history/${row.jobId}`);
                          }
                        }}
                      >
                        <td className="px-4 py-2.5 align-top text-slate-700 dark:text-slate-200">{formatDateTime(row.timestamp)}</td>
                        <td className="px-4 py-2.5 align-top text-slate-700 dark:text-slate-200">
                          <div className="font-medium" style={twoLineClampStyle}>{row.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400" style={twoLineClampStyle}>{row.filename ?? '--'}</div>
                        </td>
                        <td className="px-4 py-2.5 align-top text-slate-700 dark:text-slate-200">
                          <span style={twoLineClampStyle}>{row.location}</span>
                        </td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.rowsReceived ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.validUnique ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.needsReview ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.outOfScope ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.skipped ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{row.duplicates ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-right text-slate-700 dark:text-slate-200">{formatCurrency(row.spendUsd)}</td>
                        <td className="px-4 py-2.5 align-top text-slate-700 dark:text-slate-200">{row.calls ?? '--'}</td>
                        <td className="px-4 py-2.5 align-top text-slate-700 dark:text-slate-200">
                          <Badge variant={getBadgeVariant(row.status)}>
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top" onClick={(event) => { event.stopPropagation(); void ensureExportCatalog(row.jobId); }}>
                          <ExportPanel
                            mode="popover"
                            triggerLabel="Export"
                            className="relative inline-block text-left"
                            catalog={catalogByJobId[row.jobId] ?? FALLBACK_EXPORT_CATALOG}
                            onDownload={(type, label) => {
                              void handleDownload(row.jobId, type, label);
                            }}
                            activeDownloadType={getRowActiveDownloadType(row.jobId)}
                            disabled={!row.hasId}
                          />
                        </td>
                        <td className="px-2 py-2.5 align-top text-right text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                            Open
                            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                              <path d="M7.22 4.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06L8.28 14.53a.75.75 0 11-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 010-1.06z" />
                            </svg>
                          </span>
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
        </Card>
      </div>
    </AppShell>
  );
}
