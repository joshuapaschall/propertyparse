import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const getBatchRollup = vi.fn();
const getBatchJobs = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const createBatch = vi.fn();
const parseFileAsync = vi.fn();
const uploadFile = vi.fn();
const retryJobRow = vi.fn();
const approveMatchedJobRow = vi.fn();
const approveMatchedJobRowsBatch = vi.fn();
const runAiFixFlaggedRows = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => ({ role: 'admin' }) }));
vi.mock('../components/FileUploadCard', () => ({ default: () => null }));
vi.mock('../components/BatchUploadCard', () => ({ default: ({ onChange }: { onChange: (files: File[]) => void }) => <button onClick={() => onChange([new File(['a'], 'a.xlsx'), new File(['b'], 'b.xlsx')])}>pick-batch</button> }));
vi.mock('../components/AsyncLocationSelect', () => ({ default: ({ label, onChange }: any) => <button onClick={() => onChange(label === 'State' ? 'TX' : 'Austin')}>set-{label}</button> }));
vi.mock('../components/AsyncLocationMultiSelect', () => ({ default: ({ label, onChange }: any) => <button onClick={() => onChange(['Travis'])}>set-{label}</button> }));
vi.mock('../components/ProgressIndicator', () => ({ default: () => null }));
vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({ default: () => null }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => null }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/imageCompressor', () => ({ compressImage: vi.fn(async (f: File) => f) }));
vi.mock('../lib/pdfChunker', () => ({ chunkImagesIntoPdfs: vi.fn(async (f: File) => [{ file: f }]) }));
vi.mock('../lib/api', () => ({
  getBatchRollup: (...a: unknown[]) => getBatchRollup(...a),
  getBatchJobs: (...a: unknown[]) => getBatchJobs(...a),
  getJobDetail: (...a: unknown[]) => getJobDetail(...a),
  getJobResults: (...a: unknown[]) => getJobResults(...a),
  createBatch: (...a: unknown[]) => createBatch(...a),
  parseFileAsync: (...a: unknown[]) => parseFileAsync(...a),
  uploadFile: (...a: unknown[]) => uploadFile(...a),
  getJobWithStatus: vi.fn(), getAllJobRows: vi.fn(), getApiErrorInfo: vi.fn(() => null), downloadJobExport: vi.fn(), getJobExportCatalog: vi.fn(async () => []), approveMatchedJobRow: (...a: unknown[]) => approveMatchedJobRow(...a), approveMatchedJobRowsBatch: (...a: unknown[]) => approveMatchedJobRowsBatch(...a), retryJobBatch: vi.fn(), retryJobRow: (...a: unknown[]) => retryJobRow(...a), retryParseBatch: vi.fn(), retryParseRow: vi.fn(), runAiFixFlaggedRows: (...a: unknown[]) => runAiFixFlaggedRows(...a),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('scrollTo', vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
  createBatch.mockResolvedValue({ id: 'batch-1' });
  uploadFile.mockResolvedValue({ fileId: 'f' });
  parseFileAsync.mockResolvedValue({ ok: true });
  getBatchRollup
    .mockResolvedValueOnce({ effective_status: 'RUNNING', progress: { phase: 'VERIFYING', done: 1, total: 6, percent: 20, eta_seconds: null, cache_hits: 0, google_calls_used: 0, jobs_total: 2, jobs_running: 2, jobs_completed: 0 } })
    .mockResolvedValueOnce({ effective_status: 'COMPLETE', progress: { phase: 'FINALIZING_RESULTS', done: 6, total: 6, percent: 100, eta_seconds: null, cache_hits: 0, google_calls_used: 0, jobs_total: 2, jobs_running: 0, jobs_completed: 2 } });
  getBatchJobs.mockResolvedValue([{ id: 'j1', status: 'COMPLETED', file_name: 'a.xlsx' }, { id: 'j2', status: 'COMPLETED', file_name: 'b.xlsx' }]);
  getJobDetail.mockImplementation(async (jobId: string) => ({ summary: { rows_received: 3, matched: 1, valid_total: 1, valid_unique: 1, needs_review: 2, out_of_scope: 0, skipped: 0, duplicates: 0, attention_total: 2, google_calls_used: 3, openai_ocr_calls_used: 1, spend_usd: 0.1 }, job: { id: jobId } }));
  getJobResults.mockImplementation(async (jobId: string) => ({
    row_results: [
      { source_row_id: `${jobId}-1`, source_row_index: 1, address_raw: jobId === 'j2' ? '1 Main St B' : '1 Main St', status: 'Matched' },
      { source_row_id: `${jobId}-2`, source_row_index: 2, address_raw: jobId === 'j2' ? '2 Main St B' : '2 Main St', status: 'Unmatched' },
      { source_row_id: `${jobId}-3`, source_row_index: 3, address_raw: jobId === 'j2' ? '3 Main St B' : '3 Main St', status: 'Unmatched' },
    ],
  }));
  retryJobRow.mockResolvedValue({ updated_row_results: [] });
  approveMatchedJobRow.mockResolvedValue({ updated_row_results: [] });
  approveMatchedJobRowsBatch.mockResolvedValue({ updated_row_results: [], failed_rows: [], metadata: { approved_count: 0, failed_count: 0, requested_count: 0 } });
  runAiFixFlaggedRows.mockResolvedValue({ updated_row_results: [] });
});
afterEach(() => vi.useRealTimers());

const startBatchProcessing = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('upload-mode-batch'));
  await user.click(screen.getByText('pick-batch'));
  await user.click(screen.getByText('set-State'));
  await user.click(screen.getByText('set-Counties'));
  await user.click(await screen.findByRole('button', { name: /Process batch/i }, { timeout: 10000 }));
  await waitFor(() => expect(getBatchRollup).toHaveBeenCalled(), { timeout: 10000 });
  await waitFor(() => expect(getBatchJobs).toHaveBeenCalledWith('batch-1'), { timeout: 10000 });
  await waitFor(() => expect(getJobResults.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
};

const findReviewButtonForRow = async (rowIdentifier: string) => {
  const buttons = await screen.findAllByRole('button', { name: /Review/i }, { timeout: 10000 });
  for (const btn of buttons) {
    const row = btn.closest('tr');
    if (row && within(row).queryByText(new RegExp(rowIdentifier, 'i'))) {
      return btn;
    }
  }
  throw new Error(`No Review button found for row containing ${rowIdentifier}`);
};

const findCheckboxForRow = async (rowIdentifier: string) => {
  const checkboxes = await screen.findAllByRole('checkbox', { name: /^Select row group /i }, { timeout: 10000 });
  for (const checkbox of checkboxes) {
    const row = checkbox.closest('tr');
    if (row && within(row).queryByText(new RegExp(rowIdentifier, 'i'))) {
      return checkbox;
    }
  }
  throw new Error(`No checkbox found for row containing ${rowIdentifier}`);
};

it('hydrates and merges multi-job batch results into unified table', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await startBatchProcessing(user);
  expect(getJobResults).toHaveBeenNthCalledWith(1, 'j1');
  expect(getJobResults).toHaveBeenNthCalledWith(2, 'j2');

  // After hydration, rowResults state must be populated with all 6 rows (3 from each job).
  // If rowResults stayed empty, the modern UI would render the "Processing mismatch" banner.
  // Wait for the parse summary tab to appear, then assert no mismatch banner.
  await screen.findByRole('button', { name: /Valid \(rows: 2/i }, { timeout: 10000 });
  expect(screen.queryByText(/Processing mismatch/i)).toBeNull();

  // AccountedRowsIndicator-relevant state: 6 rows total across both jobs (1 matched + 2 unmatched per job)
  // The Needs Review pill reflects unmatched_needs_review count — both jobs report needs_review: 2.
  expect(screen.getByText(/Needs Review \(.* · 4 rows\)/i)).toBeTruthy();
});

it('routes per-row retry to row.source_job_id in batch mode', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await startBatchProcessing(user);
  const needsReviewTab = await screen.findByRole('button', { name: /^Needs Review \(/i }, { timeout: 10000 });
  await user.click(needsReviewTab);
  // j2 addresses are suffixed with "B" in fixtures so we can uniquely target a second-job row.
  const reviewButton = await findReviewButtonForRow('2 Main St B');
  await user.click(reviewButton);
  const input = await screen.findByPlaceholderText(/Type a corrected address/i, { timeout: 10000 });
  await user.clear(input);
  await user.type(input, '123 Test Ave');
  await user.click(screen.getByRole('button', { name: /Retry & Next/i }));
  await waitFor(() => expect(retryJobRow).toHaveBeenCalled());
  expect(retryJobRow.mock.calls[0][0]).toBe('j2');
}, 30000);

it('routes per-row approve to row.source_job_id in batch mode', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await startBatchProcessing(user);
  const needsReviewTab = await screen.findByRole('button', { name: /^Needs Review \(/i }, { timeout: 10000 });
  await user.click(needsReviewTab);
  // We use the drawer path (Approve & Next) since Unmatched fixtures do not guarantee inline "Approve matched".
  const reviewButton = await findReviewButtonForRow('2 Main St B');
  await user.click(reviewButton);
  await user.click(await screen.findByRole('button', { name: /Approve & Next/i }, { timeout: 10000 }));
  await waitFor(() => expect(approveMatchedJobRow).toHaveBeenCalled(), { timeout: 10000 });
  expect(approveMatchedJobRow.mock.calls[0][0]).toBe('j2');
}, 30000);

it('bulk-approve fans out across source_job_ids', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await startBatchProcessing(user);
  const needsReviewTab = await screen.findByRole('button', { name: /^Needs Review \(/i }, { timeout: 10000 });
  await user.click(needsReviewTab);
  const j1Checkbox = await findCheckboxForRow('2 Main St');
  const j2Checkbox = await findCheckboxForRow('2 Main St B');
  await user.click(j1Checkbox);
  await user.click(j2Checkbox);
  approveMatchedJobRowsBatch.mockClear();
  await user.click(screen.getByRole('button', { name: /Approve Selected/i }));
  await waitFor(() => expect(approveMatchedJobRowsBatch).toHaveBeenCalled(), { timeout: 10000 });
  const calls = approveMatchedJobRowsBatch.mock.calls;
  const jobIds = new Set(calls.map((c) => c[0]));
  expect(jobIds).toEqual(new Set(['j1', 'j2']));
}, 30000);

it('auto-fix flagged rows fans out by source_job_id', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await startBatchProcessing(user);
  const autoFixButton = await screen.findByRole('button', { name: /Auto-fix flagged rows \(AI\)/i }, { timeout: 10000 });
  runAiFixFlaggedRows.mockClear();
  await user.click(autoFixButton);
  await waitFor(() => expect(runAiFixFlaggedRows).toHaveBeenCalled(), { timeout: 10000 });
  const calls = runAiFixFlaggedRows.mock.calls;
  const jobIds = new Set(calls.map((c) => c[0]));
  expect(jobIds).toEqual(new Set(['j1', 'j2']));
  expect(calls.every((c) => c[1] === true)).toBe(true);
}, 30000);
