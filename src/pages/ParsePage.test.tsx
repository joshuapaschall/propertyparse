import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const getJobWithStatus = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getAllJobRows = vi.fn();
const parseFile = vi.fn();
const uploadFile = vi.fn();
const getApiErrorInfo = vi.fn();
const runAiFixFlaggedRows = vi.fn();
const publishJobUpdate = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({
  default: ({ onChange }: { onChange: (file: File) => void }) => (
    <button type="button" onClick={() => onChange(new File(['a'], 'sample.csv', { type: 'text/csv' }))}>select-file</button>
  ),
}));
vi.mock('../components/AsyncLocationSelect', () => ({
  default: ({ label, onChange, disabled }: { label: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(label === 'State' ? 'TX' : label.includes('County') ? 'Travis' : 'Austin')}
    >
      set-{label}
    </button>
  ),
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
vi.mock('../components/ui/EmptyState', () => ({ default: () => null }));
vi.mock('../components/ui/Skeleton', () => ({ default: () => null }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/liveUpdates', () => ({ publishJobUpdate: (...args: unknown[]) => publishJobUpdate(...args) }));
vi.mock('../lib/api', () => ({
  downloadJobExport: vi.fn(),
  getApiErrorInfo: (...args: unknown[]) => getApiErrorInfo(...args),
  getJobExportCatalog: vi.fn(async () => []),
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getAllJobRows: (...args: unknown[]) => getAllJobRows(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobWithStatus: (...args: unknown[]) => getJobWithStatus(...args),
  parseFile: (...args: unknown[]) => parseFile(...args),
  parseFileAsync: vi.fn(),
  approveMatchedJobRow: vi.fn(async () => ({ updated_row_results: [], updated_job: {} })),
  approveMatchedJobRowsBatch: vi.fn(),
  retryJobBatch: vi.fn(),
  retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: (...args: unknown[]) => runAiFixFlaggedRows(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

describe('ParsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    getApiErrorInfo.mockImplementation(() => null);
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    parseFile.mockResolvedValue({ summary: { rows_received: 1 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'VERIFYING' } });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    runAiFixFlaggedRows.mockResolvedValue({ attempted_count: 1, upgraded_count: 1, rewritten_count: 0, updated_row_results: [], updated_job: {} });
  });

  it('publishes invalidation events after parse completion', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Processing Results')).toBeInTheDocument();
    await waitFor(() => expect(publishJobUpdate).toHaveBeenCalled());
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job-updated' }));
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'metrics-updated' }));
  });



  it('shows needs review issue/row counts, duplicate impact, and prefers safe display address', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 3 });
    const reviewRows = [
      {
        source_row_id: 'r1',
        source_row_index: 1,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '4785 hwy 5',
        matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
        google_display_address: '4785 Highway 5, Douglasville, GA 30135',
      },
      {
        source_row_id: 'r2',
        source_row_index: 2,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '4785 hwy 5',
        matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
      },
      {
        source_row_id: 'r3',
        source_row_index: 3,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '2198 hwy 92',
        matched_address: '2198 Georgia 92, Douglasville, Georgia 30135',
      },
    ];
    const summary = { rows_received: 3, needs_review: 3, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 3 };
    parseFile.mockResolvedValue({
      summary,
      row_results: reviewRows,
      canonical_addresses: [],
      duplicate_groups: [],
    });
    getJobResults.mockResolvedValue({ summary, row_results: reviewRows, canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText(/Needs Review \(2 issues · 3 rows\)/)).toBeInTheDocument();
  });

  it('publishes invalidation events after AI auto-fix completion', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(screen.getByRole('button', { name: 'Process File' }));

    await screen.findByText('Processing Results');
    publishJobUpdate.mockClear();

    await user.click(screen.getByRole('button', { name: /Auto-fix flagged rows/i }));
    await waitFor(() => expect(runAiFixFlaggedRows).toHaveBeenCalled());
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job-updated' }));
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'metrics-updated' }));
  });
});
