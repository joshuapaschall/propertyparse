import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getJobExportCatalog = vi.fn();
const downloadJobExport = vi.fn();
const updateJobMetadata = vi.fn();
const showToast = vi.fn();
const subscribeJobUpdates = vi.fn();
const authState = { role: 'admin' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../App', () => ({ useAuthControls: () => authState }));
vi.mock('../components/TablePagination', () => ({ default: ({ totalCount, rangeContext }: { totalCount: number; rangeContext?: string }) => <div>{`pagination: ${totalCount}${rangeContext ? ` ${rangeContext}` : ''}`}</div> }));
vi.mock('../components/exports/ExportPanel', () => ({
  default: ({ catalog, onDownload }: { catalog: Array<{ type: string; label: string }>; onDownload: (type: any, label: string) => void }) => (
    <div>{catalog.map((item) => <button key={item.type} type="button" onClick={() => onDownload(item.type as any, item.label)}>{`download-${item.type}`}</button>)}</div>
  ),
}));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/liveUpdates', () => ({ subscribeJobUpdates: (...args: unknown[]) => subscribeJobUpdates(...args) }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
  updateJobMetadata: (...args: unknown[]) => updateJobMetadata(...args),
}));

describe('HistoryDetailPage summary normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['h1\n'], { type: 'text/csv' }), filename: 'f.csv' });
    updateJobMetadata.mockResolvedValue({});
    showToast.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    subscribeJobUpdates.mockImplementation(() => () => undefined);
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

  it('does not use csv fallback for original upload and preserves filename and extension', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1' }],
      canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St' }],
    });
    getJobExportCatalog.mockResolvedValue([
      { type: 'original_file', label: 'Original Upload', filename: 'source-upload.xlsx', content_type: 'application/vnd.ms-excel', size_bytes: 2048 },
    ]);
    downloadJobExport.mockResolvedValue({
      blob: new Blob(['raw-bytes'], { type: 'application/vnd.ms-excel' }),
      filename: 'source-upload.xlsx',
      contentType: 'application/vnd.ms-excel',
      sizeBytes: 2048,
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Rows Received');
    await user.click(screen.getByRole('button', { name: 'download-original_file' }));
    expect(downloadJobExport).toHaveBeenCalledWith('job-1', 'original_file');
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
    expect(screen.getAllByText('$7.50').length).toBeGreaterThan(0);
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
  });

  it('renders resolver metadata and one-candidate badge in history review tables', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 1, valid_total: 0, valid_unique: 0, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, valid_total: 0, valid_unique: 0, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [
        {
          source_row_id: 'r1',
          source_row_index: 1,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: '123 Main',
          matched_address: '123 Main St',
          resolver_strategy: 'suffix_unique',
          decision_tier: 'suffix',
          candidate_count_in_scope: 1,
          ambiguity_reason: 'Suffix normalization required manual confirmation',
        },
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

    await user.click(await screen.findByRole('button', { name: 'Needs Review (1 issues · 1 rows)' }));
    expect(screen.getByText('One candidate found')).toBeInTheDocument();
    expect(screen.getByText('Internal diagnostics')).toBeInTheDocument();
    expect(screen.getByText(/suffix_unique/i)).toBeInTheDocument();
    expect(screen.getByText(/Only unresolved or ambiguous candidates remain in review./i)).toBeInTheDocument();
  });

  it('shows original vs normalized compare input and preserves legacy review rows', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5 },
      summary: { rows_received: 2, valid_total: 0, valid_unique: 0, needs_review: 2, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 2, valid_total: 0, valid_unique: 0, needs_review: 2, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [
        {
          source_row_id: 'r1',
          source_row_index: 1,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: 'R/W @ 3841 MONTICELLO ST',
          normalized_compare_input: '3841 MONTICELLO ST',
          matched_address: '3841 Monticello St',
          resolver_strategy: 'wrapper_text_single_candidate',
          ambiguity_reason: 'Wrapper text removed; one in-scope candidate found',
          candidate_count_in_scope: 1,
        },
        {
          source_row_id: 'r2',
          source_row_index: 2,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: 'Legacy Review Row',
          reason_code: 'LOW_PRECISION',
        },
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
    expect(screen.getAllByText('R/W @ 3841 MONTICELLO ST').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('Compared as:') ?? false).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('3841 MONTICELLO ST').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wrapper text removed; one in-scope candidate found/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Legacy Review Row').length).toBeGreaterThan(0);
  });

  it('edits campaign name from the history detail page', async () => {
    const user = userEvent.setup();
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 2.5, campaign_name: 'Old Campaign' },
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1' }],
      canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St' }],
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Rows Received');
    await user.clear(screen.getByLabelText('Edit campaign name'));
    await user.type(screen.getByLabelText('Edit campaign name'), 'Updated Campaign');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(updateJobMetadata).toHaveBeenCalledWith('job-1', { campaignName: 'Updated Campaign' }));
  });



  it('renders remaining free cap and reconciliation details from nested pricing data', async () => {
    getJobDetail.mockResolvedValue({
      job: {
        job_id: 'job-1',
        customer_safe_usage: { estimated_job_cost_usd: 4.5, credits_used: 2 },
        internal_admin_usage: {
          estimated_monthly_total_usd: 40,
          geocoding_calls: 3,
          autocomplete_calls: 2,
          place_details_calls: 1,
          input_tokens: 10,
          output_tokens: 5,
        },
        reconciliation: {
          status: 'settled',
          remaining_free_cap: { geocoding: 11, autocomplete: 22, place_details: 33 },
        },
      },
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, out_of_scope: 0, duplicates: 0 },
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1' }],
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
    expect(screen.getByText('This job')).toBeInTheDocument();
    expect(screen.getByText('Month to date')).toBeInTheDocument();
    expect(screen.getByText('Remaining free cap (Geocoding)')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation / sync status')).toBeInTheDocument();
    expect(screen.getByText('settled')).toBeInTheDocument();
  });

});
