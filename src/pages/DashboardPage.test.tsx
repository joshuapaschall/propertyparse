import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

const getMetricsSummary = vi.fn();
const readLocalParsePersistenceState = vi.fn();
const authState = { role: 'member' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => authState }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getMetricsSummary: (...args: unknown[]) => getMetricsSummary(...args),
  getApiErrorInfo: vi.fn(() => null),
}));
vi.mock('../lib/persistenceStatus', () => ({
  readLocalParsePersistenceState: () => readLocalParsePersistenceState(),
}));
const subscribeJobUpdates = vi.fn();
vi.mock('../lib/liveUpdates', () => ({
  subscribeJobUpdates: (...args: unknown[]) => subscribeJobUpdates(...args),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'member';
    readLocalParsePersistenceState.mockReturnValue(null);
    subscribeJobUpdates.mockImplementation(() => () => undefined);
    getMetricsSummary.mockResolvedValue({
      files_uploaded: 4,
      potential_properties: 20,
      valid_unique: 10,
      review_queue_total: 3,
      exports: 2,
      excluded_total: 5,
      needs_review: 3,
      skipped: 1,
      out_of_scope: 2,
      duplicates: 2,
      total_cost_usd: 12.25,
      matched: 999,
      unmatched: 888,
    });
  });

  it('uses canonical KPI metrics and does not render unresolved card', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Unique Valid')).toBeInTheDocument();
    expect(screen.getByText('Review Queue')).toBeInTheDocument();
    expect(screen.getByText('Excluded Total: 5')).toBeInTheDocument();
    expect(screen.queryByText('Unresolved')).not.toBeInTheDocument();
    expect(screen.getByText(/Rows still requiring review or correction/i)).toBeInTheDocument();
  });

  it('sends custom range shape when custom dates are set', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Files Uploaded');
    await user.click(screen.getByRole('button', { name: 'Custom Range' }));
    await user.type(screen.getByLabelText('Custom start date'), '2025-01-01');
    await user.type(screen.getByLabelText('Custom end date'), '2025-01-31');
    expect(getMetricsSummary).toHaveBeenLastCalledWith('month', { startDate: '2025-01-01', endDate: '2025-01-31' });
  });

  it('shows helper copy when durable metrics are zero and last run had persistence warning', async () => {
    readLocalParsePersistenceState.mockReturnValue({ persistenceWarning: true, completedAt: '2025-01-01T00:00:00.000Z', version: 1 });
    subscribeJobUpdates.mockImplementation(() => () => undefined);
    getMetricsSummary.mockResolvedValue({ files_uploaded: 0, potential_properties: 0, valid_unique: 0, review_queue_total: 0, exports: 0, total_cost_usd: 0 });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText(/Dashboard metrics only include saved jobs/i)).toBeInTheDocument();
  });

  it('refreshes when summary-ready live updates fire', async () => {
    let handler: ((event: { kind: string }) => void) | null = null;
    subscribeJobUpdates.mockImplementation((cb: (event: { kind: string }) => void) => {
      handler = cb;
      return () => undefined;
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Files Uploaded');
    const before = getMetricsSummary.mock.calls.length;
    await act(async () => {
      handler?.({ kind: 'metrics-updated' });
      await Promise.resolve();
    });
    await screen.findByText('Files Uploaded');
    expect(getMetricsSummary.mock.calls.length).toBeGreaterThan(before);
  });

  it('shows internal cost transparency only for admin and owner roles', async () => {
    authState.role = 'admin';
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Internal cost transparency')).toBeInTheDocument();
    expect(screen.getByText('Month to date')).toBeInTheDocument();
    expect(screen.getByText('Estimated monthly total')).toBeInTheDocument();
  });

  it('keeps cost copy product-safe for member roles', async () => {
    authState.role = 'member';
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Usage estimate')).toBeInTheDocument();
    expect(screen.queryByText('Geocoding calls')).not.toBeInTheDocument();
    expect(screen.getByText('Estimated cost')).toBeInTheDocument();
  });


  it('renders admin pricing transparency from nested usage data', async () => {
    authState.role = 'admin';
    getMetricsSummary.mockResolvedValue({
      files_uploaded: 4,
      potential_properties: 20,
      valid_unique: 10,
      review_queue_total: 3,
      exports: 2,
      total_cost_usd: 12.25,
      customer_safe_usage: { estimated_job_cost_usd: 3.75, credits_used: 6 },
      internal_admin_usage: {
        estimated_monthly_total_usd: 45.5,
        geocoding_calls: 14,
        autocomplete_calls: 7,
        place_details_calls: 5,
        input_tokens: 200,
        output_tokens: 50,
      },
      month_to_date_geocoding_calls: 14,
      month_to_date_autocomplete_calls: 7,
      month_to_date_place_details_calls: 5,
      reconciliation: {
        status: 'matched',
        remaining_free_cap: { geocoding: 100, autocomplete: 90, place_details: 80 },
      },
    });

    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Internal cost transparency')).toBeInTheDocument();
    expect(screen.getByText('Month to date')).toBeInTheDocument();
    expect(screen.getByText('$45.50')).toBeInTheDocument();
    expect(screen.getByText('Remaining free cap (Geocoding)')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation / sync status')).toBeInTheDocument();
    expect(screen.getByText('matched')).toBeInTheDocument();
  });

  it('renders explicit month-to-date values instead of defaulting month cards to zero', async () => {
    authState.role = 'admin';
    getMetricsSummary.mockResolvedValue({
      files_uploaded: 1,
      potential_properties: 2,
      valid_unique: 1,
      review_queue_total: 0,
      exports: 0,
      month_to_date_geocoding_calls: 19,
      month_to_date_autocomplete_calls: 8,
      month_to_date_place_details_calls: 6,
      google_month_to_date_actual_or_estimated_cost_usd: 27.4,
      geocoding_calls: 0,
      autocomplete_calls: 0,
      place_details_calls: 0,
    });

    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByText('Month-to-date geocoding usage')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.queryAllByText(/^0$/).length).toBeLessThan(3);
  });

  it('shows the local-only warning when billing snapshot data is missing', async () => {
    authState.role = 'admin';
    getMetricsSummary.mockResolvedValue({
      files_uploaded: 1,
      potential_properties: 1,
      valid_unique: 1,
      review_queue_total: 0,
      exports: 0,
      billing_snapshot_missing: true,
      month_to_date_geocoding_calls: 5,
    });

    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByText(/Local estimate only/i)).toBeInTheDocument();
  });

});
