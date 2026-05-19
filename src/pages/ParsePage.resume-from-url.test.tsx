import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ParsePage from './ParsePage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getBatchRollup = vi.fn();
const getBatchJobs = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => ({ role: 'admin' }) }));
vi.mock('../components/FileUploadCard', () => ({ default: () => null }));
vi.mock('../components/BatchUploadCard', () => ({ default: () => null }));
vi.mock('../components/AsyncLocationSelect', () => ({ default: () => null }));
vi.mock('../components/AsyncLocationMultiSelect', () => ({ default: () => null }));
vi.mock('../components/ProgressIndicator', () => ({ default: () => null }));
vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({ default: () => null }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => null }));
vi.mock('../components/ResultsTable', () => ({ default: ({ rows }: any) => <div>{rows.map((r: any) => <div key={r.source_row_id}>{r.source_job_id}:{r.source_row_id}</div>)}</div> }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/imageCompressor', () => ({ compressImage: vi.fn(async (f: File) => f) }));
vi.mock('../lib/pdfChunker', () => ({ chunkImagesIntoPdfs: vi.fn(async () => []) }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...a: unknown[]) => getJobDetail(...a),
  getJobResults: (...a: unknown[]) => getJobResults(...a),
  getBatchRollup: (...a: unknown[]) => getBatchRollup(...a),
  getBatchJobs: (...a: unknown[]) => getBatchJobs(...a),
  getJobWithStatus: vi.fn(), getAllJobRows: vi.fn(), getApiErrorInfo: vi.fn(() => null), downloadJobExport: vi.fn(), getJobExportCatalog: vi.fn(async () => []), approveMatchedJobRow: vi.fn(), approveMatchedJobRowsBatch: vi.fn(), retryJobBatch: vi.fn(), retryJobRow: vi.fn(), retryParseBatch: vi.fn(), retryParseRow: vi.fn(), runAiFixFlaggedRows: vi.fn(), createBatch: vi.fn(), parseFileAsync: vi.fn(), uploadFile: vi.fn(), downloadBatchExport: vi.fn(),
}));

describe('ParsePage resume from URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rehydrates a single-file job from /parse?job=<uuid>', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    getJobDetail.mockResolvedValue({ summary: { rows_received: 1, valid_total: 1, valid_unique: 1 }, job: { id: jobId } });
    getJobResults.mockResolvedValue({ row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'Matched' }] });

    render(<MemoryRouter initialEntries={[`/parse?job=${jobId}`]}><ParsePage /></MemoryRouter>);

    await waitFor(() => expect(getJobDetail).toHaveBeenCalledWith(jobId));
    expect(await screen.findByRole('button', { name: /Valid \(rows: 1/i })).toBeInTheDocument();
  });

  it('rehydrates a completed batch from /parse?batch=<uuid>', async () => {
    const batchId = '22222222-2222-4222-8222-222222222222';
    getBatchRollup.mockResolvedValue({ effective_status: 'COMPLETE' });
    getBatchJobs.mockResolvedValue([{ id: 'j1', status: 'COMPLETED', file_name: 'a.csv' }, { id: 'j2', status: 'COMPLETED', file_name: 'b.csv' }]);
    getJobDetail.mockResolvedValue({ summary: { rows_received: 1, valid_total: 1, valid_unique: 1 }, job: {} });
    getJobResults.mockImplementation(async (jobId: string) => ({ row_results: [{ source_row_id: `${jobId}-r1`, source_row_index: 1, status: 'Matched' }] }));

    render(<MemoryRouter initialEntries={[`/parse?batch=${batchId}`]}><ParsePage /></MemoryRouter>);

    await waitFor(() => expect(getBatchJobs).toHaveBeenCalledWith(batchId));
    await waitFor(() => expect(getJobResults).toHaveBeenCalledTimes(2));
    expect(getJobResults).toHaveBeenNthCalledWith(1, 'j1');
    expect(getJobResults).toHaveBeenNthCalledWith(2, 'j2');
  });

  it('shows informational error when batch /parse?batch=<uuid> is RUNNING', async () => {
    const batchId = '33333333-3333-4333-8333-333333333333';
    getBatchRollup.mockResolvedValue({ effective_status: 'RUNNING' });
    render(<MemoryRouter initialEntries={[`/parse?batch=${batchId}`]}><ParsePage /></MemoryRouter>);
    expect(await screen.findByText(/still processing/i)).toBeInTheDocument();
    expect(getBatchJobs).not.toHaveBeenCalled();
  });

  it('shows error when batch effective_status is FAILED', async () => {
    const batchId = '44444444-4444-4444-8444-444444444444';
    getBatchRollup.mockResolvedValue({ effective_status: 'FAILED' });
    render(<MemoryRouter initialEntries={[`/parse?batch=${batchId}`]}><ParsePage /></MemoryRouter>);
    expect(await screen.findByText(/failed to process/i)).toBeInTheDocument();
    expect(getBatchJobs).not.toHaveBeenCalled();
  });

  it('ignores /parse?batch=<not-a-uuid>', async () => {
    render(<MemoryRouter initialEntries={['/parse?batch=not-a-uuid']}><ParsePage /></MemoryRouter>);
    await waitFor(() => expect(getBatchRollup).not.toHaveBeenCalled());
    expect(screen.queryByText(/Unable to load this batch/i)).toBeNull();
  });
});
