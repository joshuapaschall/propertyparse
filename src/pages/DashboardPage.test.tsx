import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

const getMetricsSummary = vi.fn();
const readLocalParsePersistenceState = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getMetricsSummary: (...args: unknown[]) => getMetricsSummary(...args),
  getApiErrorInfo: vi.fn(() => null),
}));
vi.mock('../lib/persistenceStatus', () => ({
  readLocalParsePersistenceState: () => readLocalParsePersistenceState(),
}));
vi.mock('../lib/liveUpdates', () => ({
  subscribeJobUpdates: vi.fn(() => () => undefined),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readLocalParsePersistenceState.mockReturnValue(null);
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
    getMetricsSummary.mockResolvedValue({ files_uploaded: 0, potential_properties: 0, valid_unique: 0, review_queue_total: 0, exports: 0, total_cost_usd: 0 });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText(/Dashboard metrics only include saved jobs/i)).toBeInTheDocument();
  });
});
