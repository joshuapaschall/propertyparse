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
  approveMatchedJobRow: vi.fn(),
  approveMatchedJobRowsBatch: vi.fn(),
  retryJobBatch: vi.fn(),
  retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: vi.fn(),
  uploadFile: vi.fn(),
}));

describe('ParsePage export launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'DONE', rows_received: 10, valid_total: 8, valid_unique: 7, needs_review: 1, out_of_scope: 1, skipped: 1, duplicates: 1, matched: 8, attention_total: 3 } });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: { rows_received: 10, valid_total: 8, valid_unique: 7, needs_review: 1, out_of_scope: 1, skipped: 1, duplicates: 1, matched: 8, attention_total: 3 } });
    getJobResults.mockResolvedValue({ summary: { rows_received: 10, valid_total: 8, valid_unique: 7, needs_review: 1, out_of_scope: 1, skipped: 1, duplicates: 1, matched: 8, attention_total: 3 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    getJobExportCatalog.mockResolvedValue([]);
  });


  it('does not render debug mode controls in production UI', async () => {
    render(
      <MemoryRouter initialEntries={['/parse?job=job-1']}>
        <ParsePage />
      </MemoryRouter>,
    );

    await screen.findByText('Processing Results');
    expect(screen.queryByText('Debug mode')).not.toBeInTheDocument();
  });

  it('shows one Export button and grouped options after click', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/parse?job=job-1']}>
        <ParsePage />
      </MemoryRouter>,
    );

    const exportTrigger = await screen.findByText('Export');
    await user.click(exportTrigger);
    expect(await screen.findByText('Most Used')).toBeInTheDocument();
    expect(screen.getByText('PropStream Import')).toBeInTheDocument();
  });

  it('shows clear button when parse results exist', async () => {
    render(
      <MemoryRouter initialEntries={['/parse?job=job-1']}>
        <ParsePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });
});
