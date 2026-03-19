import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

const getMetricsSummary = vi.fn();
const readLocalParsePersistenceState = vi.fn();
const authState = { role: 'member' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../App', () => ({ useAuthControls: () => authState }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
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
    expect(screen.getByText('Estimated job cost')).toBeInTheDocument();
  });

  it('keeps cost copy product-safe for member roles', async () => {
    authState.role = 'member';
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Usage estimate')).toBeInTheDocument();
    expect(screen.queryByText('Geocoding calls')).not.toBeInTheDocument();
    expect(screen.getByText('Estimated cost')).toBeInTheDocument();
  });

});
