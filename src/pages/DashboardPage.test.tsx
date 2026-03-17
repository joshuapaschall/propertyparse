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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readLocalParsePersistenceState.mockReturnValue(null);
    getMetricsSummary.mockResolvedValue({ uploads: 4, leads: 20, matched: 10, unmatched: 3, exports: 2, spend_usd: 12.25 });
  });

  it('loads metrics and renders KPI cards', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Files Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Potential Properties')).toBeInTheDocument();
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
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
    getMetricsSummary.mockResolvedValue({ uploads: 0, leads: 0, matched: 0, unmatched: 0, exports: 0, spend_usd: 0 });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText(/Dashboard metrics only include saved jobs/i)).toBeInTheDocument();
  });
});
