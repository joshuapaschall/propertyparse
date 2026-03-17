import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getJobExportCatalog = vi.fn();
const downloadJobExport = vi.fn();
const showToast = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/TablePagination', () => ({ default: ({ totalCount, rangeContext }: { totalCount: number; rangeContext?: string }) => <div>{`pagination: ${totalCount}${rangeContext ? ` ${rangeContext}` : ''}`}</div> }));
vi.mock('../components/exports/ExportPanel', () => ({
  default: ({ catalog, onDownload }: { catalog: Array<{ type: string; label: string }>; onDownload: (type: any, label: string) => void }) => (
    <div>{catalog.map((item) => <button key={item.type} type="button" onClick={() => onDownload(item.type as any, item.label)}>{`download-${item.type}`}</button>)}</div>
  ),
}));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/liveUpdates', () => ({ subscribeJobUpdates: vi.fn(() => () => undefined) }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
}));

describe('HistoryDetailPage summary normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['h1\n'], { type: 'text/csv' }), filename: 'f.csv' });
    showToast.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });




  it('renders summary while results are finalizing, then hydrates tables', async () => {
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 2, valid_total: 1, valid_unique: 1, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults
      .mockRejectedValueOnce(new Error('HTTP 202: finalizing'))
      .mockResolvedValueOnce({
        summary: { rows_received: 2, valid_total: 1, valid_unique: 1, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
        row_results: [
          { source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1' },
          { source_row_id: 'r2', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW' },
        ],
        canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St' }],
      });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    expect(screen.getByText(/Results are finalizing/i)).toBeInTheDocument();
    expect(await screen.findByText('1 Main St', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(showToast).not.toHaveBeenCalled();
  });
  it('shows needs review issue/row counts and grouped row impact with safe display addresses', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 3, valid_total: 0, valid_unique: 0, needs_review: 3, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 3, valid_total: 0, valid_unique: 0, needs_review: 3, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '4785 hwy 5', matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135', google_display_address: '4785 Highway 5, Douglasville, GA 30135' },
        { source_row_id: 'r2', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '4785 hwy 5', matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135' },
        { source_row_id: 'r3', source_row_index: 3, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '2198 hwy 92', matched_address: '2198 Georgia 92, Douglasville, Georgia 30135' },
      ],
      canonical_addresses: [],
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Needs Review (2 issues · 3 rows)' }));
    expect(screen.getByText('2 rows affected')).toBeInTheDocument();
    expect(screen.getByText('4785 Highway 5, Douglasville, GA 30135')).toBeInTheDocument();
    expect(screen.getByText('pagination: 2 issues · 3 rows')).toBeInTheDocument();
    expect(screen.getByText('Needs Review Issues')).toBeInTheDocument();
    expect(screen.getByText('3 rows')).toBeInTheDocument();
  });



  it('shows export integrity warning and uses local fallback on header-only history export', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 1, valid_total: 0, valid_unique: 0, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, valid_total: 0, valid_unique: 0, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '123 Main', reason_code: 'LOW_PRECISION' }],
      canonical_addresses: [],
    });
    getJobExportCatalog.mockResolvedValue([{ type: 'needs_review', row_count: 0 }]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['only_header\n'], { type: 'text/csv' }), filename: 'needs.csv' });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Saved export rows are unavailable for this run/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'download-needs_review' }));
    expect(downloadJobExport).toHaveBeenCalled();
  });

  it('renders compare debug metadata and reason filter narrows review groups', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 2, valid_total: 0, valid_unique: 0, needs_review: 2, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 2, valid_total: 0, valid_unique: 0, needs_review: 2, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: 'route row', reason_code: 'ROUTE_ALIAS', blocked_by: 'directional conflict' },
        { source_row_id: 'r2', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: 'house row', reason_code: 'HOUSE_NUMBER_MISMATCH', compare_debug: 'same house number' },
      ],
      canonical_addresses: [],
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Needs Review (2 issues · 2 rows)' }));
    expect(screen.getByText(/Blocked by directional conflict/)).toBeInTheDocument();
    expect(screen.getByText(/Route Alias \/ Route Mismatch:/)).toBeInTheDocument();
    expect(screen.getByText(/pagination: 2 issues · 2 rows/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Needs review reason filter'), 'house_number');
    expect(screen.getByText(/pagination: 1 issues · 2 rows/)).toBeInTheDocument();
  });

  it('uses row-derived counts and backend spend, ignoring metadata spend', async () => {
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 9.4 },
      summary: { rows_received: 0, valid_total: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 0, valid_total: 0, valid_unique: 0, needs_review: 0, spend_usd: 7.5 },
      metadata: { spend_usd: 999 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' },
        { source_row_id: 'r2', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW' },
      ],
      canonical_addresses: [],
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('$7.50')).toBeInTheDocument();
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
  });
});
