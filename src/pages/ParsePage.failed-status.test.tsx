import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const mocks = vi.hoisted(() => ({
  approveMatchedJobRow: vi.fn(),
  approveMatchedJobRowsBatch: vi.fn(),
  downloadBatchExport: vi.fn(),
  downloadJobExport: vi.fn(),
  getAllJobRows: vi.fn(),
  getApiErrorInfo: vi.fn(),
  getBatchJobs: vi.fn(),
  getBatchRollup: vi.fn(),
  getJobDetail: vi.fn(),
  getJobExportCatalog: vi.fn(),
  getJobResults: vi.fn(),
  getJobWithStatus: vi.fn(),
  parseFileAsync: vi.fn(),
  retryJobBatch: vi.fn(),
  retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: vi.fn(),
  uploadFile: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({ default: () => <div>file-upload</div> }));
vi.mock('../components/BatchUploadCard', () => ({ default: () => <div>batch-upload</div> }));
vi.mock('../components/AsyncLocationSelect', () => ({ default: () => <div>location-select</div> }));
vi.mock('../components/AsyncLocationMultiSelect', () => ({ default: () => <div>location-multi-select</div> }));
vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/ProgressIndicator', () => ({
  default: ({ percent }: { percent?: number | null }) => (
    <div>{typeof percent === 'number' ? `percent:${percent}` : 'indeterminate'}</div>
  ),
}));
vi.mock('../components/ResultsTable', () => ({ default: () => null }));
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/ui/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/ui/EmptyState', () => ({ default: () => null }));
vi.mock('../components/ui/Skeleton', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({ default: () => null }));
vi.mock('../components/JobWarnings', () => ({ default: () => null }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/imageCompressor', () => ({ compressImage: vi.fn() }));
vi.mock('../lib/pdfChunker', () => ({ chunkImagesIntoPdfs: vi.fn() }));
vi.mock('../lib/liveUpdates', () => ({ publishJobUpdate: vi.fn() }));
vi.mock('../lib/api', () => ({
  approveMatchedJobRow: (...args: unknown[]) => mocks.approveMatchedJobRow(...args),
  approveMatchedJobRowsBatch: (...args: unknown[]) => mocks.approveMatchedJobRowsBatch(...args),
  createBatch: vi.fn(),
  downloadBatchExport: (...args: unknown[]) => mocks.downloadBatchExport(...args),
  downloadJobExport: (...args: unknown[]) => mocks.downloadJobExport(...args),
  getAllJobRows: (...args: unknown[]) => mocks.getAllJobRows(...args),
  getApiErrorInfo: (...args: unknown[]) => mocks.getApiErrorInfo(...args),
  getBatchJobs: (...args: unknown[]) => mocks.getBatchJobs(...args),
  getBatchRollup: (...args: unknown[]) => mocks.getBatchRollup(...args),
  getJobDetail: (...args: unknown[]) => mocks.getJobDetail(...args),
  getJobExportCatalog: (...args: unknown[]) => mocks.getJobExportCatalog(...args),
  getJobResults: (...args: unknown[]) => mocks.getJobResults(...args),
  getJobWithStatus: (...args: unknown[]) => mocks.getJobWithStatus(...args),
  parseFileAsync: (...args: unknown[]) => mocks.parseFileAsync(...args),
  retryJobBatch: (...args: unknown[]) => mocks.retryJobBatch(...args),
  retryJobRow: (...args: unknown[]) => mocks.retryJobRow(...args),
  retryParseBatch: (...args: unknown[]) => mocks.retryParseBatch(...args),
  retryParseRow: (...args: unknown[]) => mocks.retryParseRow(...args),
  runAiFixFlaggedRows: (...args: unknown[]) => mocks.runAiFixFlaggedRows(...args),
  uploadFile: (...args: unknown[]) => mocks.uploadFile(...args),
}));

describe('ParsePage failed-status hydration', () => {
  const failedJobId = '7d43590e-2f8c-4be7-a5cb-1db487b0d22a';
  const failedMessage = '429: Daily quota exceeded. Contact admin or raise limit.';

  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    mocks.getApiErrorInfo.mockReturnValue(null);
    mocks.getJobExportCatalog.mockResolvedValue([]);
    mocks.getAllJobRows.mockResolvedValue([]);
    mocks.getJobDetail.mockResolvedValue({
      job: {
        job_id: failedJobId,
        status: 'FAILED',
        phase: 'DONE',
        error_message: failedMessage,
        total_rows: 0,
        matched_count: 0,
      },
      summary: {},
    });
    mocks.getJobResults.mockResolvedValue({
      summary: { rows_received: 0, total_rows: 0, matched_count: 0 },
      row_results: [],
      canonical_addresses: [],
      duplicate_groups: [],
    });
  });

  it('surfaces a failed hydrated parse job instead of showing Ready', async () => {
    render(
      <MemoryRouter initialEntries={[`/?job=${failedJobId}`]}>
        <ParsePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.getJobDetail).toHaveBeenCalledWith(failedJobId));
    expect(await screen.findByText(failedMessage)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });
});
