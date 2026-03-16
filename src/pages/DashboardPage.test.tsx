import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

const getMetricsSummary = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getMetricsSummary: (...args: unknown[]) => getMetricsSummary(...args),
  getApiErrorInfo: vi.fn(() => null),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
