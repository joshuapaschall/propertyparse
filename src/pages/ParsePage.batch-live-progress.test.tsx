import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const createBatch = vi.fn();
const uploadFile = vi.fn();
const parseFileAsync = vi.fn();
const getBatchRollup = vi.fn();
const getJobWithStatus = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getAllJobRows = vi.fn();
const getApiErrorInfo = vi.fn();
const getJobExportCatalog = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => ({ role: 'admin' }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../components/FileUploadCard', () => ({ default: () => null }));
vi.mock('../components/AsyncLocationSelect', () => ({ default: ({ label, onChange }: any) => <button onClick={() => onChange('TX')}>set-{label}</button> }));
vi.mock('../components/AsyncLocationMultiSelect', () => ({ default: ({ label, onChange }: any) => <button onClick={() => onChange(['Travis'])}>set-{label}</button> }));
vi.mock('../components/ProgressIndicator', () => ({ default: ({ percent }: { percent?: number | null }) => <div data-testid="progress-indicator">percent:{percent ?? 'none'}</div> }));
vi.mock('../lib/imageCompressor', () => ({ compressImage: vi.fn() }));
vi.mock('../lib/pdfChunker', () => ({ chunkImagesIntoPdfs: vi.fn().mockResolvedValue(null) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/ResultsTable', () => ({ default: () => null }));
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({ default: () => null }));
vi.mock('../components/JobWarnings', () => ({ default: () => null }));
vi.mock('../lib/liveUpdates', () => ({ publishJobUpdate: vi.fn() }));
vi.mock('../lib/api', () => ({
  createBatch: (...args: unknown[]) => createBatch(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  parseFileAsync: (...args: unknown[]) => parseFileAsync(...args),
  getBatchRollup: (...args: unknown[]) => getBatchRollup(...args),
  getJobWithStatus: (...args: unknown[]) => getJobWithStatus(...args),
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getAllJobRows: (...args: unknown[]) => getAllJobRows(...args),
  getApiErrorInfo: (...args: unknown[]) => getApiErrorInfo(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: vi.fn(), runAiFixFlaggedRows: vi.fn(),
  approveMatchedJobRow: vi.fn(), approveMatchedJobRowsBatch: vi.fn(), retryJobBatch: vi.fn(), retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(), retryParseRow: vi.fn(),
}));

const setupBatchSubmission = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await user.click(screen.getByTestId('upload-mode-batch'));
  const input = screen.getByTestId('batch-file-input') as HTMLInputElement;
  const file1 = new File(['a'], 'a.pdf', { type: 'application/pdf' });
  const file2 = new File(['b'], 'b.pdf', { type: 'application/pdf' });
  await user.upload(input, [file1, file2]);
  await user.click(screen.getByRole('button', { name: 'set-State' }));
  await user.click(screen.getByRole('button', { name: /set-Counties/i }));
  await user.click(screen.getByTestId('parse-cta'));
};

describe('ParsePage batch live progress panel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    createBatch.mockResolvedValue({ id: 'batch-1' });
    uploadFile.mockResolvedValue({ fileId: 'f1' });
    parseFileAsync.mockResolvedValue({ job_id: 'j1' });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'j1', status: 'RUNNING' } });
    getJobDetail.mockResolvedValue({ job: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    getApiErrorInfo.mockReturnValue(null);
    getJobExportCatalog.mockResolvedValue([]);
  });

  it('renders nothing when batchLiveProgress is null', async () => {
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    expect(screen.queryByTestId('batch-live-progress-panel')).not.toBeInTheDocument();
  });

  it('renders panel after multi-job batch submission and first poll', async () => {
    getBatchRollup.mockResolvedValue({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 10, total: 20, percent: 50, eta_seconds: 150, cache_hits: 3, google_calls_used: 4, jobs_total: 3, jobs_running: 2, jobs_completed: 0 } });
    await setupBatchSubmission();
    await waitFor(() => expect(screen.getByTestId('batch-live-progress-panel')).toBeInTheDocument());
  });

  it('renders expected detail format', async () => {
    getBatchRollup.mockResolvedValue({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 150, total: 500, percent: 30, eta_seconds: 150, cache_hits: 15, google_calls_used: 75, jobs_total: 3, jobs_running: 1, jobs_completed: 1 } });
    await setupBatchSubmission();
    expect(await screen.findByTestId('batch-live-progress-detail')).toHaveTextContent('Verifying: 150/500 across 2/3 jobs • Verification calls 75 • Cache hits 15 • ETA ~ 02:30');
  });

  it('forwards percent to ProgressIndicator', async () => {
    getBatchRollup.mockResolvedValue({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 3, total: 10, percent: 33, eta_seconds: 150, cache_hits: 1, google_calls_used: 2, jobs_total: 2, jobs_running: 1, jobs_completed: 0 } });
    await setupBatchSubmission();
    expect(await screen.findByTestId('progress-indicator')).toHaveTextContent('percent:33');
  });

  it('stops polling when status becomes COMPLETE', async () => {
    getBatchRollup
      .mockResolvedValueOnce({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 2, total: 10, percent: 20, eta_seconds: 10, cache_hits: 1, google_calls_used: 1, jobs_total: 2, jobs_running: 1, jobs_completed: 0 } })
      .mockResolvedValueOnce({ effective_status: 'COMPLETE', progress: { phase: 'FINALIZING_RESULTS', done: 10, total: 10, percent: 100, eta_seconds: 0, cache_hits: 1, google_calls_used: 1, jobs_total: 2, jobs_running: 0, jobs_completed: 2 } });
    await setupBatchSubmission();
    await act(async () => { vi.advanceTimersByTime(1500); });
    const callsAtComplete = getBatchRollup.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(getBatchRollup.mock.calls.length).toBe(callsAtComplete);
  });

  it('clear button clears live progress panel', async () => {
    getBatchRollup.mockResolvedValue({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 1, total: 10, percent: 10, eta_seconds: 10, cache_hits: 1, google_calls_used: 1, jobs_total: 2, jobs_running: 1, jobs_completed: 0 } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await setupBatchSubmission();
    await user.click(await screen.findByTestId('batch-progress-clear'));
    expect(screen.queryByTestId('batch-live-progress-panel')).not.toBeInTheDocument();
  });

  it('single-job batch does not activate live progress panel', async () => {
    const user = userEvent.setup();
    createBatch.mockResolvedValue({ id: 'batch-1' });
    uploadFile.mockResolvedValue({ fileId: 'f1' });
    parseFileAsync.mockResolvedValue({ job_id: 'j1' });
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByTestId('upload-mode-batch'));
    const input = screen.getByTestId('batch-file-input') as HTMLInputElement;
    await user.upload(input, [new File(['a'], 'only.pdf', { type: 'application/pdf' })]);
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-Counties/i }));
    await user.click(screen.getByTestId('parse-cta'));
    expect(screen.queryByTestId('batch-live-progress-panel')).not.toBeInTheDocument();
    expect(getBatchRollup).not.toHaveBeenCalled();
  });
});
