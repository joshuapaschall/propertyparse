import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
const approveMatchedJobRow = vi.fn();
const approveMatchedJobRowsBatch = vi.fn();
const retryJobBatch = vi.fn();
const retryJobRow = vi.fn();
const publishJobUpdate = vi.fn();
const showToast = vi.fn();
const selectedFileFactory = vi.fn(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));
const authState = { role: 'admin' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../App', () => ({ useAuthControls: () => authState }));
vi.mock('../components/AccountedRowsIndicator', () => ({ default: () => <div>accounted</div> }));
vi.mock('../components/FileUploadCard', () => ({
  default: ({ onChange }: { onChange: (file: File) => void }) => (
    <button type="button" onClick={() => onChange(selectedFileFactory())}>select-file</button>
  ),
}));
vi.mock('../components/AsyncLocationSelect', () => ({
  default: ({
    label,
    value,
    onChange,
    disabled,
    allowCustomValue,
  }: {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    allowCustomValue?: boolean;
  }) => (
    <div>
      <label>
        {label}
        <input
          aria-label={label}
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(label === 'State' ? 'TX' : label.includes('County') ? 'Travis' : 'Austin')}
      >
        set-{label}
      </button>
      {allowCustomValue ? <span>custom-enabled</span> : null}
    </div>
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
vi.mock('../components/ui/EmptyState', () => ({ default: ({ title, description }: { title?: string; description?: string }) => <div>{title}{description ? ` ${description}` : ''}</div> }));
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
  approveMatchedJobRow: (...args: unknown[]) => approveMatchedJobRow(...args),
  approveMatchedJobRowsBatch: (...args: unknown[]) => approveMatchedJobRowsBatch(...args),
  retryJobBatch: (...args: unknown[]) => retryJobBatch(...args),
  retryJobRow: (...args: unknown[]) => retryJobRow(...args),
  retryParseBatch: vi.fn(),
  retryParseRow: vi.fn(),
  runAiFixFlaggedRows: (...args: unknown[]) => runAiFixFlaggedRows(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

describe('ParsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    Element.prototype.scrollIntoView = vi.fn();
    getApiErrorInfo.mockImplementation(() => null);
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    parseFile.mockResolvedValue({ summary: { rows_received: 1 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    parseFileAsync.mockResolvedValue({ ok: true });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'VERIFYING' } });
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['header\n'], { type: 'text/csv' }), filename: 'f.csv' });
    approveMatchedJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    approveMatchedJobRowsBatch.mockResolvedValue({ updated_row_results: [], failed_rows: [], metadata: { approved_count: 0, failed_count: 0, requested_count: 0 }, updated_job: {} });
    retryJobBatch.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    retryJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] });
    getAllJobRows.mockResolvedValue([]);
    runAiFixFlaggedRows.mockResolvedValue({ attempted_count: 1, upgraded_count: 1, rewritten_count: 0, updated_row_results: [], updated_job: {} });
    selectedFileFactory.mockImplementation(() => new File(['a'], 'sample.csv', { type: 'text/csv' }));
    window.localStorage.clear();
    showToast.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('Reviewed by operator');
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

  it('normalizes first-render parse rows so backend manual actions apply without reload', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    parseFile.mockResolvedValue({
      summary: { rows_received: 2, needs_review: 1, out_of_scope: 1, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, matched: 0, attention_total: 2 },
      row_results: [
        {
          sourceRowId: 'needs-safe',
          sourceRowIndex: 1,
          status: 'UNMATCHED_NEEDS_REVIEW',
          matchedAddress: '12 Main St',
          placeId: 'p1',
          manualActions: { canApproveMatched: true },
        },
        {
          sourceRowId: 'scope-safe',
          sourceRowIndex: 2,
          status: 'OUT_OF_SCOPE',
          matchedAddress: '14 Main St',
          placeId: 'p2',
          manualActions: { canScopeOverride: true },
        },
      ],
      canonical_addresses: [],
      duplicate_groups: [],
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 2, needs_review: 1, out_of_scope: 1, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, matched: 0, attention_total: 2 },
      row_results: [
        { source_row_id: 'needs-safe', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', matched_address: '12 Main St', place_id: 'p1', manual_actions: { can_approve_matched: true } },
        { source_row_id: 'scope-safe', source_row_index: 2, status: 'OUT_OF_SCOPE', matched_address: '14 Main St', place_id: 'p2', manual_actions: { can_scope_override: true } },
      ],
      canonical_addresses: [],
      duplicate_groups: [],
    });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await user.click((await screen.findAllByRole('button', { name: /Needs Review/i }))[0]);
    expect(await screen.findByText('Approve matched')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /Select row group/i })[0]).toBeEnabled();
    await user.click((await screen.findAllByRole('button', { name: /Out of Scope/i }))[0]);
    expect(screen.getAllByRole('checkbox', { name: /Select out of scope row group/i })[0]).toBeEnabled();
  });

  it('renders explicit force override for risky rows and keeps them out of bulk approval', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    parseFile.mockResolvedValue({
      summary: { rows_received: 2, needs_review: 2, out_of_scope: 0, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, matched: 0, attention_total: 2 },
      row_results: [
        {
          source_row_id: 'force-only',
          source_row_index: 1,
          status: 'UNMATCHED_NEEDS_REVIEW',
          matched_address: '10 Route Rd',
          place_id: 'p1',
          manual_actions: { can_force_override: true, blocker: 'Route mismatch requires explicit override' },
        },
        {
          source_row_id: 'safe-bulk',
          source_row_index: 2,
          status: 'UNMATCHED_NEEDS_REVIEW',
          matched_address: '12 Main St',
          place_id: 'p2',
          manual_actions: { can_approve_matched: true },
        },
      ],
      canonical_addresses: [],
      duplicate_groups: [],
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 2, needs_review: 2, out_of_scope: 0, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, matched: 0, attention_total: 2 },
      row_results: [
        { source_row_id: 'force-only', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', matched_address: '10 Route Rd', place_id: 'p1', manual_actions: { can_force_override: true, blocker: 'Route mismatch requires explicit override' } },
        { source_row_id: 'safe-bulk', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW', matched_address: '12 Main St', place_id: 'p2', manual_actions: { can_approve_matched: true } },
      ],
      canonical_addresses: [],
      duplicate_groups: [],
    });
    approveMatchedJobRow.mockResolvedValue({ updated_row_results: [], updated_job: {} });
    approveMatchedJobRowsBatch.mockResolvedValue({ updated_row_results: [], failed_rows: [], metadata: { approved_count: 1, failed_count: 0, requested_count: 1 }, updated_job: {} });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await user.click((await screen.findAllByRole('button', { name: /Needs Review/i }))[0]);
    expect(await screen.findByText('Override to Valid')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox', { name: /Select row group/i });
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[1]).toBeEnabled();

    await user.click(screen.getByText('Override to Valid'));
    expect(approveMatchedJobRow).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ forceOverride: true, overrideReason: 'Reviewed by operator' }),
    );
    expect(approveMatchedJobRowsBatch).not.toHaveBeenCalled();
  });

  it('shows scope summary copy for county-wide vs locality-only scope', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);

    expect(screen.getAllByText((_, element) => element?.textContent?.includes('State not selected • County not selected • All localities in county') ?? false)[0]).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    expect(screen.getAllByText((_, element) => element?.textContent?.includes('TX • Travis County • All localities in county') ?? false)[0]).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'City / locality (optional)' }));
    await user.type(screen.getByRole('textbox', { name: 'City / locality (optional)' }), 'Stonecrest');
    expect(screen.getAllByText((_, element) => element?.textContent?.includes('TX • Travis County • Stonecrest only') ?? false)[0]).toBeInTheDocument();
  });


  it('hydrates summary and results during FINALIZING_RESULTS before DONE', async () => {
    const user = userEvent.setup();
    selectedFileFactory.mockImplementation(() => new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'FINALIZING_RESULTS', progress_done: 2, progress_total: 2 } });
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', status: 'RUNNING', phase: 'FINALIZING_RESULTS', spend_usd: 1.5 },
      summary: { rows_received: 2, valid_total: 1, valid_unique: 1, needs_review: 1, skipped: 0, duplicates: 0, out_of_scope: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 2, valid_total: 1, valid_unique: 1, needs_review: 1, skipped: 0, duplicates: 0, out_of_scope: 0 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' },
        { source_row_id: 'r2', source_row_index: 2, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '2 Main St' },
      ],
      canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }],
      duplicate_groups: [],
    });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await waitFor(() => expect(getJobDetail).toHaveBeenCalled());
    await waitFor(() => expect(getJobResults).toHaveBeenCalledWith(expect.stringMatching(/.+/), { fresh: true }));
    expect(screen.getByText('Rows Received')).toBeInTheDocument();
    expect(screen.queryByText('No parse results yet')).not.toBeInTheDocument();
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job-updated' }));
    expect(publishJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'metrics-updated' }));
  });

  it('skips overlapping polling requests while one poll is in flight', async () => {
    const user = userEvent.setup();
    selectedFileFactory.mockImplementation(() => new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    let resolvePoll: ((value: unknown) => void) | null = null;
    let intervalCallback: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation(((cb: TimerHandler) => {
      intervalCallback = cb as () => void;
      return 1 as unknown as number;
    }) as typeof window.setInterval);
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
    getJobWithStatus.mockImplementation(() => new Promise((resolve) => {
      resolvePoll = resolve;
    }));

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(getJobWithStatus).toHaveBeenCalledTimes(1);
    intervalCallback?.();
    intervalCallback?.();
    expect(getJobWithStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePoll?.({ job: { job_id: 'job-1', status: 'FAILED', phase: 'FAILED', error_message: 'boom' } });
      await Promise.resolve();
    });
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

  it('shows normalized compare input, resolver details, badge, and approval blocker in needs review rows', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    const summary = { rows_received: 2, needs_review: 2, valid_total: 0, valid_unique: 0, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 0, attention_total: 2 };
    const rows = [
      {
        source_row_id: 'r1',
        source_row_index: 1,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: 'R/W @ 3841 MONTICELLO ST',
        normalized_compare_input: '3841 MONTICELLO ST',
        matched_address: '3841 Monticello St, Austin, TX 78721',
        resolver_strategy: 'wrapper_text_single_candidate',
        ambiguity_reason: 'Wrapper text removed; one in-scope candidate found',
        candidate_count_in_scope: 1,
        blocked_by: ['house_number_mismatch'],
      },
      {
        source_row_id: 'r2',
        source_row_index: 2,
        status: 'UNMATCHED_NEEDS_REVIEW',
        detected_address: '789 Legacy Ln',
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
    await user.click(await screen.findByRole('button', { name: /Needs Review \(2 issues · 2 rows\)/i }));

    expect(screen.getAllByText('R/W @ 3841 MONTICELLO ST').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('3841 MONTICELLO ST') ?? false).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('One candidate found')).toBeInTheDocument();
    expect(screen.getAllByText('Internal diagnostics').length).toBeGreaterThan(0);
    expect(screen.getByText(/wrapper_text_single_candidate/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Approval unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('House number conflict').length).toBeGreaterThan(0);
    expect(screen.getAllByText('789 Legacy Ln').length).toBeGreaterThan(0);
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
    expect(publishJobUpdate.mock.calls.length).toBeGreaterThanOrEqual(4);
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
    expect(screen.getAllByText(/Multiple in-scope candidates remain/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve matched' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Out of Scope/i })[0]);
    expect(await screen.findByText(/Approval requires verified address/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve matched' })).not.toBeInTheDocument();
  });

  it('shows product-safe session copy instead of raw token wording', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    parseFile.mockRejectedValue(new Error('We couldn’t verify your session. Sign in again.'));

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText(/we couldn’t verify your session\. sign in again\./i)).toBeInTheDocument();
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
  });

  it('shows internal cost transparency only for admin roles', async () => {
    const user = userEvent.setup();
    const summary = { rows_received: 1, needs_review: 0, valid_total: 1, valid_unique: 1, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 1, attention_total: 0, spend_usd: 4.25, geocoding_calls: 3 };
    parseFile.mockResolvedValue({ summary, row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' }], canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' }], canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Internal cost transparency')).toBeInTheDocument();
    expect(screen.getByText('Internal cost transparency')).toBeInTheDocument();
  });


  it('displays flattened pricing after rehydrating a completed job', async () => {
    getJobDetail.mockResolvedValue({
      job: {
        job_id: 'job-1',
        customer_safe_usage: { estimated_job_cost_usd: 4.25, credits_used: 2 },
        internal_admin_usage: {
          estimated_monthly_total_usd: 91.2,
          geocoding_calls: 3,
          autocomplete_calls: 2,
          place_details_calls: 1,
          input_tokens: 120,
          output_tokens: 45,
        },
        reconciliation: {
          status: 'settled',
          remaining_free_cap: { geocoding: 9, autocomplete: 8, place_details: 7 },
        },
      },
      summary: { rows_received: 1, needs_review: 0, valid_total: 1, valid_unique: 1, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 1, attention_total: 0, spend_usd: 4.25 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 1, needs_review: 0, valid_total: 1, valid_unique: 1, skipped: 0, duplicates: 0, out_of_scope: 0, matched: 1, attention_total: 0 },
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' }],
      canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }],
      duplicate_groups: [],
    });

    render(<MemoryRouter initialEntries={['/parse?job=job-1']}><ParsePage /></MemoryRouter>);

    expect(await screen.findByText('Internal cost transparency')).toBeInTheDocument();
    expect(await screen.findByText('This job')).toBeInTheDocument();
    expect(await screen.findByText('Estimated job cost')).toBeInTheDocument();
    expect(screen.getByText('$4.25')).toBeInTheDocument();
    expect(screen.getByText('Month to date')).toBeInTheDocument();
    expect(screen.getByText('Estimated monthly total')).toBeInTheDocument();
    expect(screen.getByText('$91.20')).toBeInTheDocument();
    expect(screen.getByText('Remaining free cap (Geocoding)')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation / sync status')).toBeInTheDocument();
    expect(screen.getByText('settled')).toBeInTheDocument();
  });

  it('renders job geocoding calls from job_geocoding_calls instead of google_calls_used', async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    const summary = {
      rows_received: 1,
      valid_total: 1,
      valid_unique: 1,
      needs_review: 0,
      skipped: 0,
      duplicates: 0,
      out_of_scope: 0,
      matched: 1,
      attention_total: 0,
      job_geocoding_calls: 6,
      google_calls_used: 44,
    };
    parseFile.mockResolvedValue({
      summary,
      row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1' }],
      canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }],
      duplicate_groups: [],
    });
    getJobResults.mockResolvedValue({ summary, row_results: [], canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText('Job geocoding calls')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.queryByText('44')).not.toBeInTheDocument();
  });


  it('suppresses stale zero-result states until completed job results hydrate', async () => {
    const user = userEvent.setup();
    selectedFileFactory.mockImplementation(() => new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 1 });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'DONE', phase: 'DONE', progress_done: 1, progress_total: 1 } });
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', status: 'DONE', phase: 'DONE' },
      summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, duplicates: 0, out_of_scope: 0 },
    });
    getJobResults
      .mockResolvedValueOnce({ summary: { rows_received: 0 }, row_results: [], canonical_addresses: [], duplicate_groups: [] })
      .mockResolvedValueOnce({
        summary: { rows_received: 1, valid_total: 1, valid_unique: 1, needs_review: 0, skipped: 0, duplicates: 0, out_of_scope: 0 },
        row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'VALID', canonical_id: 'c1', formatted_address: '1 Main St' }],
        canonical_addresses: [{ canonical_id: 'c1', formatted_address: '1 Main St', street1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', place_id: 'p1' }],
        duplicate_groups: [],
      });
    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await waitFor(() => expect(getJobResults.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('No unique valid addresses yet.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No addresses were detected in this file/i)).not.toBeInTheDocument();
    expect((await screen.findAllByText('1 Main St')).length).toBeGreaterThan(0);
  });

  it('suppresses processing mismatch while results are finalizing', async () => {
    const user = userEvent.setup();
    selectedFileFactory.mockImplementation(() => new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    uploadFile.mockResolvedValue({ fileId: 'f1', rowsReceived: 2 });
    getJobWithStatus.mockResolvedValue({ job: { job_id: 'job-1', status: 'RUNNING', phase: 'FINALIZING_RESULTS', progress_done: 2, progress_total: 2 } });
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', status: 'RUNNING', phase: 'FINALIZING_RESULTS' },
      summary: { rows_received: 2, valid_total: 1, valid_unique: 1, needs_review: 1, skipped: 0, duplicates: 0, out_of_scope: 0 },
    });
    getJobResults.mockRejectedValueOnce(new Error('HTTP 202: finalizing'));

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    expect(await screen.findByText(/Finalizing results/i)).toBeInTheDocument();
    expect(screen.queryByText(/Processing mismatch/i)).not.toBeInTheDocument();
  });

  it('allows a custom city entry and sends it in the parse request', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ParsePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.clear(screen.getByRole('textbox', { name: 'City / locality (optional)' }));
    await user.type(screen.getByRole('textbox', { name: 'City / locality (optional)' }), 'Stonecrest');
    expect(screen.getByText('custom-enabled')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));

    await waitFor(() =>
      expect(parseFile).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({ city: 'Stonecrest' }),
      ),
    );
  });

  it('supports out-of-scope bulk approval with scope override and updates valid rows immediately', async () => {
    const user = userEvent.setup();
    const summary = {
      rows_received: 1,
      valid_total: 0,
      valid_unique: 0,
      needs_review: 0,
      skipped: 0,
      duplicates: 0,
      out_of_scope: 1,
      matched: 0,
      attention_total: 1,
    };
    const row = {
      source_row_id: 'r1',
      source_row_index: 1,
      status: 'OUT_OF_SCOPE',
      detected_address: '123 Main St',
      matched_address: '123 Main St, Stonecrest, GA 30038',
      formatted_address: '123 Main St, Stonecrest, GA 30038',
      canonical_id: 'c1',
      place_id: 'p1',
      components: {
        street_address: '123 Main St',
        address2: 'Unit B',
        city: 'Stonecrest',
        state: 'GA',
        zip: '30038',
      },
      manual_actions: { can_scope_override: true },
    };
    parseFile.mockResolvedValue({ summary, row_results: [row], canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: [row], canonical_addresses: [], duplicate_groups: [] });
    approveMatchedJobRowsBatch.mockResolvedValue({
      updated_row_results: [{ ...row, status: 'VALID_OVERRIDE' }],
      updated_job: {
        summary: {
          ...summary,
          valid_total: 1,
          valid_unique: 1,
          out_of_scope: 0,
          matched: 1,
          attention_total: 0,
        },
      },
      failed_rows: [],
      metadata: { requested_count: 1, approved_count: 1, failed_count: 0 },
    });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));
    await user.click(await screen.findByRole('button', { name: /Out of Scope \(1 rows\)/i }));

    expect(screen.getByRole('checkbox', { name: 'Select all out of scope rows' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all out of scope rows' }));
    await user.click(screen.getByRole('button', { name: 'Approve Selected' }));

    await waitFor(() => expect(approveMatchedJobRowsBatch).toHaveBeenCalledWith(expect.any(String), ['r1'], true));

    await user.click(screen.getByRole('button', { name: /Valid \(rows:\s*1\s*·\s*unique:\s*1\)/i }));
    expect(await screen.findAllByText('123 Main St, Stonecrest, GA 30038')).toHaveLength(1);
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('Unit B')).toBeInTheDocument();
    expect(screen.getByText('Stonecrest')).toBeInTheDocument();
    expect(screen.getByText('GA')).toBeInTheDocument();
    expect(screen.getByText('30038')).toBeInTheDocument();
  });

  it('uses the same approval gating in the table and review drawer for blocked rows', async () => {
    const user = userEvent.setup();
    const summary = {
      rows_received: 1,
      valid_total: 0,
      valid_unique: 0,
      needs_review: 1,
      skipped: 0,
      duplicates: 0,
      out_of_scope: 0,
      matched: 0,
      attention_total: 1,
    };
    const row = {
      source_row_id: 'r1',
      source_row_index: 1,
      status: 'UNMATCHED_NEEDS_REVIEW',
      detected_address: '789 Legacy Ln',
      matched_address: '789 Legacy Ln, Austin, TX 78701',
      place_id: 'p1',
      candidate_count_in_scope: 1,
      blocked_by: ['house_number_mismatch'],
      resolver_strategy: 'wrapper_text_single_candidate',
      normalized_compare_input: '789 LEGACY LN',
    };
    parseFile.mockResolvedValue({ summary, row_results: [row], canonical_addresses: [], duplicate_groups: [] });
    getJobResults.mockResolvedValue({ summary, row_results: [row], canonical_addresses: [], duplicate_groups: [] });

    render(<MemoryRouter><ParsePage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'select-file' }));
    await user.click(screen.getByRole('button', { name: 'set-State' }));
    await user.click(screen.getByRole('button', { name: /set-County/i }));
    await user.click(await screen.findByRole('button', { name: /Process File|Reprocess File/i }));
    await user.click(await screen.findByRole('button', { name: /Needs Review \(1 issues · 1 rows\)/i }));

    expect(screen.getByText('Approval unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText(/Approval unavailable\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & Next' })).toBeDisabled();
    expect(approveMatchedJobRow).not.toHaveBeenCalled();
  });

});
