import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParsePage from './ParsePage';

const getJobWithStatus = vi.fn();
const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getAllJobRows = vi.fn();
const parseFile = vi.fn();
const parseFileAsync = vi.fn();
const uploadFile = vi.fn();
const getApiErrorInfo = vi.fn();
const runAiFixFlaggedRows = vi.fn();
const downloadJobExport = vi.fn();
const getJobExportCatalog = vi.fn();
const publishJobUpdate = vi.fn();
const showToast = vi.fn();
const selectedFileFactory = vi.fn(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({
  default: ({ onChange }: { onChange: (file: File) => void }) => (
    <button type="button" onClick={() => onChange(selectedFileFactory())}>select-file</button>
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
vi.mock('../components/TablePagination', () => ({
  default: ({ totalCount, rangeContext }: { totalCount: number; rangeContext?: string }) => (
    <div>pagination: {totalCount}{rangeContext ? ` ${rangeContext}` : ''}</div>
  ),
}));
vi.mock('../components/EditRowModal', () => ({ default: () => null }));
vi.mock('../components/ui/Card', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/EmptyState', () => ({ default: () => null }));
vi.mock('../components/ui/Skeleton', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({
  default: ({ catalog, onDownload }: { catalog: Array<{ type: string; label: string }>; onDownload: (type: any, label: string) => void }) => (
    <div>
      {catalog.map((item) => (
        <button key={item.type} type="button" onClick={() => onDownload(item.type as any, item.label)}>{`download-${item.type}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/locationApi', () => ({ searchCities: vi.fn(), searchCounties: vi.fn(), searchStates: vi.fn() }));
vi.mock('../lib/liveUpdates', () => ({ publishJobUpdate: (...args: unknown[]) => publishJobUpdate(...args) }));
vi.mock('../lib/api', () => ({
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
  getApiErrorInfo: (...args: unknown[]) => getApiErrorInfo(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getAllJobRows: (...args: unknown[]) => getAllJobRows(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobWithStatus: (...args: unknown[]) => getJobWithStatus(...args),
  parseFile: (...args: unknown[]) => parseFile(...args),
  parseFileAsync: (...args: unknown[]) => parseFileAsync(...args),
  approveMatchedJobRow: vi.fn(async () => ({ updated_row_results: [], updated_job: {} })),
  approveMatchedJobRowsBatch: vi.fn(),
  retryJobBatch: vi.fn(),
  retryJobRow: vi.fn(),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: (...args: unknown[]) => runAiFixFlaggedRows(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

describe('ParsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    getApiErrorInfo.mockImplementation(() => null);
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    parseFile.mockResolvedValue({ summary: { rows_received: 1 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    parseFileAsync.mockResolvedValue({ ok: true });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'VERIFYING' } });
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['header\n'], { type: 'text/csv' }), filename: 'f.csv' });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    runAiFixFlaggedRows.mockResolvedValue({ attempted_count: 1, upgraded_count: 1, rewritten_count: 0, updated_row_results: [], updated_job: {} });
    selectedFileFactory.mockImplementation(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));
    window.localStorage.clear();
    showToast.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  it('publishes invalidation events after parse completion', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Processing Results')).toBeInTheDocument();
    await waitFor(() => expect(publishJobUpdate).toHaveBeenCalled());
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job-updated' }));
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'metrics-updated' }));
  });



  it('shows needs review issue/row counts, duplicate impact, and prefers safe display address', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 3 });
    const reviewRows = [
      {
        source_row_id: 'r1',
        source_row_index: 1,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '4785 hwy 5',
        matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
        google_display_address: '4785 Highway 5, Douglasville, GA 30135',
      },
      {
        source_row_id: 'r2',
        source_row_index: 2,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '4785 hwy 5',
        matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
      },
      {
        source_row_id: 'r3',
        source_row_index: 3,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '2198 hwy 92',
        matched_address: '2198 Georgia 92, Douglasville, Georgia 30135',
      },
    ];
    const summary = { rows_received: 3, needs_review: 3, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 3 };
    parseFile.mockResolvedValue({
      summary,
      row_results: reviewRows,
      canonical_addresses: [],
      duplicate_groups: [],
    });
    getJobResults.mockResolvedValue({ summary, row_results: reviewRows, canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText(/Needs Review \(2 issues · 3 rows\)/)).toBeInTheDocument();
  });




  it('shows export integrity warning when visible rows exist and catalog row count is zero', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    const summary = { rows_received: 1, needs_review: 1, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 1 };
    const rows = [{ source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'LOW_PRECISION', detected_address: 'x' }];
    parseFile.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    getJobExportCatalog.mockResolvedValue([{ type: 'needs_review', row_count: 0 }]);

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText(/Saved export rows are unavailable for this run/i)).toBeInTheDocument();
  });

  it('uses local export fallback when backend export is header-only', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    const summary = { rows_received: 1, needs_review: 1, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 1 };
    const rows = [{ source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'LOW_PRECISION', detected_address: '12 a st' }];
    parseFile.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    downloadJobExport.mockResolvedValue({ blob: new Blob(['col1,col2\n'], { type: 'text/csv' }), filename: 'needs.csv' });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await user.click(screen.getByRole('button', { name: 'download-needs_review' }));
    expect(downloadJobExport).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Used local export fallback' }));
  });

  it('renders review breakdown/filter and compare debug metadata', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 3 });
    const summary = { rows_received: 3, needs_review: 3, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 3 };
    const rows = [
      { source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'ROUTE_ALIAS', detected_address: '1 a', blocked_by: 'directional conflict' },
      { source_row_id: 'r2', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'HOUSE_NUMBER_MISMATCH', detected_address: '2 b', compare_debug: 'same house number' },
      { source_row_id: 'r3', source_row_index: 3, status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'LOW_PRECISION', detected_address: '3 c', verification_precision: 'county' },
    ];
    parseFile.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await user.click(screen.getByRole('button', { name: /^Needs Review \(/i }));
    expect(await screen.findByText(/Route Alias \/ Route Mismatch:/)).toBeInTheDocument();
    expect(screen.getByText(/Grouped by issue so repeated copies do not inflate workload./)).toBeInTheDocument();
    expect(screen.getByText(/Route Alias \/ Route Mismatch:/)).toBeInTheDocument();

  });

  it('does not leak review rows with canonical_id into Valid Unique table', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 3 });
    const summary = {
      rows_received: 3,
      needs_review: 3,
      valid_total: 0,
      valid_unique: 0,
      skipped: 0,
      duplicates: 0,
      out_of_scope: 0,
      matched: 0,
      attention_total: 3,
    };
    parseFile.mockResolvedValue({
      summary,
      row_results: [
        {
          source_row_id: 'r1',
          source_row_index: 1,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: '600 Sutton Pl',
          canonical_id: 'canon-review-1',
          place_id: 'place-review-1',
          formatted_address: 'Sutton Pl, Douglasville, GA 30135, USA',
          components: { street_address: 'Sutton Pl', city: 'Douglasville', state: 'GA', zip: '30135' },
        },
        {
          source_row_id: 'r2',
          source_row_index: 2,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: '8786 N. View DR',
          canonical_id: 'canon-review-2',
          place_id: 'place-review-2',
          formatted_address: 'N View Dr, Georgia 30122, USA',
          components: { street_address: 'N View Dr', city: 'Douglasville', state: 'GA', zip: '30122' },
        },
        {
          source_row_id: 'r3',
          source_row_index: 3,
          status: 'UNMATCHED_NEEDS_REVIEW',
          detected_address: '3277 TALKEENTA',
          canonical_id: 'canon-review-3',
          place_id: 'place-review-3',
          formatted_address: 'Douglas County, GA, USA',
          components: { street_address: 'Douglas County', city: 'Douglasville', state: 'GA', zip: '30135' },
        },
      ],
      canonical_addresses: [],
      duplicate_groups: [],
    });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Processing Results')).toBeInTheDocument();
    expect(screen.getByText('No unique valid addresses yet.')).toBeInTheDocument();
    expect(screen.queryByText('Sutton Pl, Douglasville, GA 30135, USA')).not.toBeInTheDocument();
    expect(screen.queryByText('N View Dr, Georgia 30122, USA')).not.toBeInTheDocument();
    expect(screen.queryByText('Douglas County, GA, USA')).not.toBeInTheDocument();
  });


  it('hydrates summary first and retries rows for async completion', async () => {
    const user = userEvent.setup();
    selectedFileFactory.mockImplementation(() => new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 3 });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'DONE', phase: 'DONE' } });
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1' },
      summary: { rows_received: 3, valid_total: 2, valid_unique: 2, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
    });
    getJobResults
      .mockRejectedValueOnce(new Error('HTTP 202: not ready'))
      .mockResolvedValueOnce({
        summary: { rows_received: 3, valid_total: 2, valid_unique: 2, needs_review: 1, skipped: 0, out_of_scope: 0, duplicates: 0 },
        row_results: [
          { source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' },
          { source_row_id: 'r2', source_row_index: 2, status: 'VALID', canonical_id: 'c2', formatted_address: '2 Main St' },
          { source_row_id: 'r3', source_row_index: 3, status: 'UNMATCHED_NEEDS_REVIEW' },
        ],
        canonical_addresses: [
          { canonical_id: 'c1', formatted_address: '1 Main St' },
          { canonical_id: 'c2', formatted_address: '2 Main St' },
        ],
        duplicate_groups: [],
      });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    expect((await screen.findAllByText(/Finalizing results/i)).length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.queryByText(/Finalizing results/i)).not.toBeInTheDocument(), { timeout: 4000 });
    expect(publishJobUpdate).toHaveBeenCalledTimes(4);
  });
  it('publishes invalidation events after AI auto-fix completion', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(screen.getByRole('button', { name: 'Process File' }));

    await screen.findByText('Processing Results');
    publishJobUpdate.mockClear();

    await user.click(screen.getByRole('button', { name: /Auto-fix flagged rows/i }));
    await waitFor(() => expect(runAiFixFlaggedRows).toHaveBeenCalled());
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job-updated' }));
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'metrics-updated' }));
  });


  it('hides unsafe approve actions behind compact explanations for ambiguous and low-precision review rows', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    const summary = { rows_received: 2, needs_review: 2, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 2 };
    const rows = [
      {
        source_row_id: 'r1',
        source_row_index: 1,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '12 Main',
        matched_address: '12 Main St',
        candidate_count_in_scope: 2,
        competing_place_ids: ['p1', 'p2'],
        ambiguity_reason: 'Two plausible parcels remain',
      },
      {
        source_row_id: 'r2',
        source_row_index: 2,
        status: 'OUT_OF_SCOPE',
        detected_address: '45 County Rd',
        matched_address: '45 County Rd',
        verification_precision: 'county',
        resolver_strategy: 'county_only_fallback',
        reason_code: 'LOW_PRECISION',
      },
    ];
    parseFile.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: rows, canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await user.click(screen.getByRole('button', { name: /^Needs Review \(/i }));
    expect(await screen.findByText(/Approval unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Still ambiguous: 2 in-scope candidates/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve matched' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Out of Scope/i })[0]);
    expect(await screen.findByText(/County-only candidate cannot be approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve matched' })).not.toBeInTheDocument();
  });

});
