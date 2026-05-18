import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../components/ResultsTable', () => ({ default: ({ rows }: { rows: any[] }) => <div data-testid='rows'>{rows.map((r) => <div key={r.id}>{r.source_job_id}:{r.source_file_name}</div>)}</div> }));
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
  getJobWithStatus: vi.fn(), getAllJobRows: vi.fn(), getApiErrorInfo: vi.fn(() => null), downloadJobExport: vi.fn(), getJobExportCatalog: vi.fn(async () => []), approveMatchedJobRow: vi.fn(), approveMatchedJobRowsBatch: vi.fn(), retryJobBatch: vi.fn(), retryJobRow: vi.fn(), retryParseBatch: vi.fn(), retryParseRow: vi.fn(), runAiFixFlaggedRows: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
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
      { source_row_id: `${jobId}-1`, source_row_index: 1, address_raw: '1 Main St', status: 'Matched' },
      { source_row_id: `${jobId}-2`, source_row_index: 2, address_raw: '2 Main St', status: 'Unmatched' },
      { source_row_id: `${jobId}-3`, source_row_index: 3, address_raw: '3 Main St', status: 'Unmatched' },
    ],
  }));
});
afterEach(() => vi.useRealTimers());

it('hydrates and merges multi-job batch results into unified table', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<MemoryRouter><ParsePage /></MemoryRouter>);
  await user.click(screen.getByTestId('upload-mode-batch'));
  await user.click(screen.getByText('pick-batch'));
  await user.click(screen.getByText('set-State'));
  await user.click(screen.getByText('set-Counties'));
  await user.click(await screen.findByRole('button', { name: /Process batch/i }));
  await waitFor(() => expect(getBatchRollup).toHaveBeenCalled(), { timeout: 10000 });
  await waitFor(() => expect(getBatchJobs).toHaveBeenCalledWith('batch-1'), { timeout: 10000 });
  await waitFor(() => expect(getJobResults).toHaveBeenCalledTimes(2), { timeout: 10000 });
  expect(getJobResults).toHaveBeenNthCalledWith(1, 'j1');
  expect(getJobResults).toHaveBeenNthCalledWith(2, 'j2');
});
