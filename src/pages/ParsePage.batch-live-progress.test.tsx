import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParsePage, { formatBatchProgressDetail } from './ParsePage';

const getJobWithStatus = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getAllJobRows = vi.fn();
const parseFileAsync = vi.fn();
const uploadFile = vi.fn();
const getApiErrorInfo = vi.fn();
const runAiFixFlaggedRows = vi.fn();
const downloadJobExport = vi.fn();
const getJobExportCatalog = vi.fn();
const approveMatchedJobRow = vi.fn();
const approveMatchedJobRowsBatch = vi.fn();
const retryJobBatch = vi.fn();
const retryJobRow = vi.fn();
const publishJobUpdate = vi.fn();
const showToast = vi.fn();
const selectedFileFactory = vi.fn(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));
const authState = { role: 'admin' };
const getBatchRollup = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => authState }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({
  default: ({ onChange }: { onChange: (file: File) => void }) => (
    <button type="button" onClick={() => onChange(selectedFileFactory())}>select-file</button>
  ),
}));
vi.mock('../components/BatchUploadCard', () => ({
  default: ({ files }: { files: File[] }) => (
    <div data-testid="batch-upload-card-mock">batch-card: {files.length} file(s)</div>
  ),
}));
vi.mock('../lib/imageCompressor', () => ({ compressImage: vi.fn() }));
vi.mock('../lib/pdfChunker', () => ({ chunkImagesIntoPdfs: vi.fn() }));
vi.mock('../components/AsyncLocationSelect', () => ({
  default: ({
    label,
    value,
    onChange,
    disabled,
    allowCustomValue,
  }: {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    allowCustomValue?: boolean;
  }) => (
    <div>
      <label>
        {label}
        <input
          aria-label={label}
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(label === 'State' ? 'TX' : 'Austin')}
      >
        set-{label}
      </button>
      {allowCustomValue ? <span>custom-enabled</span> : null}
    </div>
  ),
}));
vi.mock('../components/AsyncLocationMultiSelect', () => ({
  default: ({ label, values = [], onChange, disabled }: { label: string; values?: string[]; onChange: (values: string[]) => void; disabled?: boolean }) => {
    const presetValues = label === 'Counties' ? ['Travis'] : ['Stonecrest', 'Lithonia'];
    return (
      <div>
        <label>{label}<input aria-label={label} disabled={disabled} value={values.join(', ')} readOnly /></label>
        <button type="button" disabled={disabled} onClick={() => onChange(presetValues)}>{`set-${label}`}</button>
        <button type="button" disabled={disabled} onClick={() => onChange([])}>{`clear-${label}`}</button>
      </div>
    );
  },
}));

vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/ProgressIndicator', () => ({
  default: ({ percent }: { percent?: number | null }) => <div>{typeof percent === 'number' ? `percent:${percent}` : 'indeterminate'}</div>,
}));
vi.mock('../components/ResultsTable', () => ({ default: () => null }));
vi.mock('../components/TablePagination', () => ({
  default: ({ totalCount, rangeContext }: { totalCount: number; rangeContext?: string }) => (
    <div>pagination: {totalCount}{rangeContext ? ` ${rangeContext}` : ''}</div>
  ),
}));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/ui/Card', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/EmptyState', () => ({ default: ({ title, description }: { title?: string; description?: string }) => <div>{title}{description ? ` ${description}` : ''}</div> }));
vi.mock('../components/ui/Skeleton', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({
  default: ({ catalog, onDownload }: { catalog: Array<{ type: string; label: string }>; onDownload: (type: any, label: string) => void }) => (
    <div>
      {catalog.map((item) => (
        <button key={item.type} type="button" onClick={() => onDownload(item.type as any, item.label)}>{`download-${item.type}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/liveUpdates', () => ({ publishJobUpdate: (...args: unknown[]) => publishJobUpdate(...args) }));
vi.mock('../lib/api', () => ({
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
  getApiErrorInfo: (...args: unknown[]) => getApiErrorInfo(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getAllJobRows: (...args: unknown[]) => getAllJobRows(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobWithStatus: (...args: unknown[]) => getJobWithStatus(...args),
  getBatchRollup: (...args: unknown[]) => getBatchRollup(...args),
  getBatches: vi.fn(),
  getBatchJobs: vi.fn(),
  createBatch: vi.fn(),
  parseFileAsync: (...args: unknown[]) => parseFileAsync(...args),
  approveMatchedJobRow: (...args: unknown[]) => approveMatchedJobRow(...args),
  approveMatchedJobRowsBatch: (...args: unknown[]) => approveMatchedJobRowsBatch(...args),
  retryJobBatch: (...args: unknown[]) => retryJobBatch(...args),
  retryJobRow: (...args: unknown[]) => retryJobRow(...args),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: (...args: unknown[]) => runAiFixFlaggedRows(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

const base = {
  phase: 'VERIFYING',
  done: 150,
  total: 500,
  eta: '02:30',
  cacheHits: 15,
  googleCallsUsed: 75,
  jobsRunning: 2,
  jobsCompleted: 1,
  jobsTotal: 3,
  effectiveStatus: 'RUNNING',
} as const;

describe('formatBatchProgressDetail', () => {
  it('returns null when input is null', () => {
    expect(formatBatchProgressDetail(null)).toBeNull();
  });

  it('formats the canonical verifying line with ETA', () => {
    expect(formatBatchProgressDetail({ ...base })).toBe(
      'Verifying: 150/500 across 3/3 jobs • Verification calls 75 • Cache hits 15 • ETA ~ 02:30',
    );
  });

  it('omits ETA when not present', () => {
    expect(formatBatchProgressDetail({ ...base, eta: null })).toBe(
      'Verifying: 150/500 across 3/3 jobs • Verification calls 75 • Cache hits 15',
    );
  });

  it('labels EXTRACTING phase correctly', () => {
    expect(formatBatchProgressDetail({ ...base, phase: 'EXTRACTING' })).toContain('Extracting:');
  });

  it('labels AI_FIXING phase correctly', () => {
    expect(formatBatchProgressDetail({ ...base, phase: 'AI_FIXING' })).toContain('AI fixing:');
  });

  it('labels FINALIZING_RESULTS phase as Finalizing', () => {
    expect(formatBatchProgressDetail({ ...base, phase: 'FINALIZING_RESULTS' })).toContain('Finalizing:');
  });

  it('labels PERSISTING_ROWS phase as Finalizing', () => {
    expect(formatBatchProgressDetail({ ...base, phase: 'PERSISTING_ROWS' })).toContain('Finalizing:');
  });

  it('falls back to Processing for unknown phase', () => {
    expect(formatBatchProgressDetail({ ...base, phase: 'WEIRD' })).toContain('Processing:');
  });

  it('returns null when effectiveStatus is COMPLETE', () => {
    expect(formatBatchProgressDetail({ ...base, effectiveStatus: 'COMPLETE' })).toBeNull();
  });

  it('returns null when effectiveStatus is PARTIAL', () => {
    expect(formatBatchProgressDetail({ ...base, effectiveStatus: 'PARTIAL' })).toBeNull();
  });

  it('returns null when effectiveStatus is FAILED', () => {
    expect(formatBatchProgressDetail({ ...base, effectiveStatus: 'FAILED' })).toBeNull();
  });

  it('renders -- when done or total is null', () => {
    expect(formatBatchProgressDetail({ ...base, done: null, total: null })).toContain('--/--');
  });

  it('renders -- when verification counters are null', () => {
    const s = formatBatchProgressDetail({ ...base, cacheHits: null, googleCallsUsed: null });
    expect(s).toContain('Verification calls --');
    expect(s).toContain('Cache hits --');
  });

  it('computes jobs ratio as (completed+running)/total', () => {
    expect(formatBatchProgressDetail({ ...base, jobsCompleted: 4, jobsRunning: 1, jobsTotal: 7 })).toContain('5/7 jobs');
  });
});

describe('ParsePage batch live-progress panel — render smoke', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    authState.role = 'admin';
    Element.prototype.scrollIntoView = vi.fn();
    getApiErrorInfo.mockImplementation(() => null);
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    parseFileAsync.mockResolvedValue({ ok: true });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'DONE', phase: 'DONE', progress_done: 1, progress_total: 1 } });
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['header\n'], { type: 'text/csv' }), filename: 'f.csv' });
    approveMatchedJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    approveMatchedJobRowsBatch.mockResolvedValue({ updated_row_results: [], failed_rows: [], metadata: { approved_count: 0, failed_count: 0, requested_count: 0 }, updated_job: {} });
    retryJobBatch.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    retryJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    runAiFixFlaggedRows.mockResolvedValue({ attempted_count: 1, upgraded_count: 1, rewritten_count: 0, updated_row_results: [], updated_job: {} });
    selectedFileFactory.mockImplementation(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));
    window.localStorage.clear();
    showToast.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('Reviewed by operator');
    getBatchRollup.mockResolvedValue({
      batch: { id: 'batch-1', org_id: 'o', user_id: 'u', name: null, status: 'RUNNING', state: 'GA', county: 'Fulton', counties: ['Fulton'], city: null, localities: [], scope_mode: 'county_wide', campaign_name: null, metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      job_counts: { total: 3, pending: 0, running: 2, succeeded: 1, failed: 0 },
      row_totals: { total_rows: 500, matched_count: 150, unmatched_count: 0 },
      effective_status: 'RUNNING',
      progress: { phase: 'VERIFYING', done: 150, total: 500, percent: 30, eta_seconds: 150, cache_hits: 15, google_calls_used: 75, jobs_total: 3, jobs_running: 2, jobs_completed: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render the batch-live-progress panel by default', () => {
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    expect(screen.queryByTestId('batch-live-progress-panel')).not.toBeInTheDocument();
  });
});
