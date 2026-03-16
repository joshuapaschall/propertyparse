import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const getJobWithStatus = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getAllJobRows = vi.fn();
const getJobExportCatalog = vi.fn();
const approveMatchedJobRow = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({ default: () => <div>upload</div> }));
vi.mock('../components/AsyncLocationSelect', () => ({ default: () => <div>location</div> }));
vi.mock('../components/ProcessingReportModal', () => ({ default: () => null }));
vi.mock('../components/ProgressIndicator', () => ({ default: () => null }));
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
  getApiErrorInfo: vi.fn(() => null),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getAllJobRows: (...args: unknown[]) => getAllJobRows(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobWithStatus: (...args: unknown[]) => getJobWithStatus(...args),
  parseFile: vi.fn(),
  parseFileAsync: vi.fn(),
  approveMatchedJobRow: (...args: unknown[]) => approveMatchedJobRow(...args),
  approveMatchedJobRowsBatch: vi.fn(),
  retryJobBatch: vi.fn(),
  retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: vi.fn(),
  uploadFile: vi.fn(),
}));

describe('ParsePage', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), writable: true });
    vi.clearAllMocks();
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'DONE' } });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1', rows_received: 0 }, summary: { rows_received: 0, valid_total: 0, valid_unique: 0, needs_review: 0, out_of_scope: 0, skipped: 0, duplicates: 0, matched: 0, attention_total: 0 } });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [{ source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' }], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    getJobExportCatalog.mockResolvedValue([]);
    approveMatchedJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
  });

  it('loads results summary with row_results present', async () => {
    render(<MemoryRouter initialEntries={['/parse?job=job-1']}><ParsePage /></MemoryRouter>);
    await screen.findByText('Processing Results');
    expect(getJobResults).toHaveBeenCalledWith('job-1', { fresh: undefined });
  });

  it('passes allowScopeOverride=true for out-of-scope approve action', async () => {
    const user = userEvent.setup();
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, out_of_scope: 1 },
      row_results: [{ source_row_id: 'r2', source_row_index: 0, status: 'OUT_OF_SCOPE', reason_code: 'OUT_OF_SCOPE', place_id: 'pid-1', canonical_address: { formatted_address: '123 Main St' } }],
      canonical_addresses: [],
      duplicate_groups: [],
    });

    render(<MemoryRouter initialEntries={['/parse?job=job-1']}><ParsePage /></MemoryRouter>);
    await screen.findByText('Out of Scope (1 rows)');
    await user.click(screen.getByText('Out of Scope (1 rows)'));
    await user.click(screen.getByRole('button', { name: 'Approve matched' }));

    expect(approveMatchedJobRow).toHaveBeenCalledWith('job-1', expect.objectContaining({ allowScopeOverride: true }));
  });
});
