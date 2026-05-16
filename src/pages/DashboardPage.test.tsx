import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

const getMetricsSummary = vi.fn();
const getBatches = vi.fn();
const readLocalParsePersistenceState = vi.fn();
const authState = { role: 'member' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => authState }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getMetricsSummary: (...args: unknown[]) => getMetricsSummary(...args),
  getBatches: (...args: unknown[]) => getBatches(...args),
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
    });
    getBatches.mockResolvedValue({ items: [] });
  });

  it('renders relabeled KPI metrics and keeps review helper text', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Addresses In')).toBeInTheDocument();
    expect(screen.getByText('Verified Unique')).toBeInTheDocument();
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.getByText('Exports')).toBeInTheDocument();
    expect(screen.getByText('Cost This Period')).toBeInTheDocument();
    expect(screen.getByText(/Rows still requiring review/i)).toBeInTheDocument();
  });

  it('sends custom range shape when custom dates are set', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Files');
    await user.click(screen.getByRole('button', { name: 'Custom Range' }));
    await user.type(screen.getByLabelText('Custom start date'), '2025-01-01');
    await user.type(screen.getByLabelText('Custom end date'), '2025-01-31');
    expect(getMetricsSummary).toHaveBeenLastCalledWith('month', { startDate: '2025-01-01', endDate: '2025-01-31' });
  });

  it('shows helper copy when durable metrics are zero and last run had persistence warning', async () => {
    readLocalParsePersistenceState.mockReturnValue({ persistenceWarning: true, completedAt: '2025-01-01T00:00:00.000Z', version: 1 });
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
    await screen.findByText('Files');
    const before = getMetricsSummary.mock.calls.length;
    await act(async () => {
      handler?.({ kind: 'metrics-updated' });
      await Promise.resolve();
    });
    expect(getMetricsSummary.mock.calls.length).toBeGreaterThan(before);
  });

  it('hides internal strings regardless of role', async () => {
    authState.role = 'owner';
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Cost This Period')).toBeInTheDocument();

    for (const forbidden of ['Internal cost transparency', 'Reconciliation', 'Geocoding', 'Place Details', 'Free cap', 'Local estimate only']) {
      expect(screen.queryByText(new RegExp(forbidden, 'i'))).not.toBeInTheDocument();
    }
  });
});
