import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/ui/Card', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/EmptyState', () => ({ default: () => null }));
vi.mock('../components/ui/Skeleton', () => ({ default: () => null }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
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
  runAiFixFlaggedRows: vi.fn(),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

describe('ParsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiErrorInfo.mockImplementation(() => null);
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'VERIFYING' } });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
  });

  it('does not surface raw job-not-found as main warning during in-flight polling outage', async () => {
    const user = userEvent.setup();
    parseFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ summary: { rows_received: 1 }, row_results: [], canonical_addresses: [], duplicate_groups: [] }), 4000);
        }),
    );
    getJobWithStatus.mockRejectedValue(new Error('HTTP 404: job not found'));
    getApiErrorInfo.mockReturnValue({ status: 404, endpoint: '/jobs/j-1', message: 'HTTP 404: job not found' });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(screen.getByRole('button', { name: 'Process File' }));

    expect(await screen.findByText('Processing is still running. Live progress will appear when available.')).toBeInTheDocument();
    expect(screen.queryByText(/Still working, but live progress is unavailable\. Last error:/i)).not.toBeInTheDocument();
  }, 15000);

  it('keeps local parse results after completion even if durable job detail is unavailable', async () => {
    const user = userEvent.setup();
    parseFile.mockResolvedValue({
      summary: { rows_received: 1, valid_unique: 1 },
      row_results: [{ source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' }],
      canonical_addresses: [],
      duplicate_groups: [],
    });
    getJobDetail.mockRejectedValue(new Error('HTTP 404: job not found'));
    getJobResults.mockRejectedValue(new Error('HTTP 404: job not found'));

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(screen.getByRole('button', { name: 'Process File' }));

    expect(await screen.findByText('Processing Results')).toBeInTheDocument();
    expect(await screen.findByText('This run completed locally, but has not been saved to History yet.', {}, { timeout: 15000 })).toBeInTheDocument();
  }, 20000);

  it('hides percent when there is no live progress source', async () => {
    const user = userEvent.setup();
    parseFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ summary: { rows_received: 1 }, row_results: [], canonical_addresses: [], duplicate_groups: [] }), 3000);
        }),
    );
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'VERIFYING' } });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(screen.getByRole('button', { name: 'Process File' }));

    expect(await screen.findByText('indeterminate')).toBeInTheDocument();
    expect(screen.queryByText(/percent:/i)).not.toBeInTheDocument();
  }, 15000);
});
