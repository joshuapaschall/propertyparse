import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from './AdminPage';

const getOrgMembers = vi.fn();
const getSystemDiagnostics = vi.fn();
const getGoogleProviderUsageStatus = vi.fn();
const getOpenAiProviderUsageSummary = vi.fn();
const getMetricsSummary = vi.fn();
const syncGoogleProviderUsage = vi.fn();
const syncOpenAiProviderUsage = vi.fn();
const showToast = vi.fn();
const authState = { role: 'owner' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/StatusIndicators', () => ({
  default: () => (
    <div>
      <div data-testid="status-pill-api-health">API Health</div>
      <div data-testid="status-pill-api-keys">API Keys</div>
      <button type="button">Status Refresh</button>
    </div>
  ),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => authState }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/api', () => ({
  getApiErrorInfo: (error: unknown) => (error && typeof error === 'object' && 'apiErrorInfo' in (error as Record<string, unknown>)
    ? (error as { apiErrorInfo: unknown }).apiErrorInfo
    : null),
  getOrgMembers: (...args: unknown[]) => getOrgMembers(...args),
  getSystemDiagnostics: (...args: unknown[]) => getSystemDiagnostics(...args),
  getGoogleProviderUsageStatus: (...args: unknown[]) => getGoogleProviderUsageStatus(...args),
  getOpenAiProviderUsageSummary: (...args: unknown[]) => getOpenAiProviderUsageSummary(...args),
  getMetricsSummary: (...args: unknown[]) => getMetricsSummary(...args),
  syncGoogleProviderUsage: (...args: unknown[]) => syncGoogleProviderUsage(...args),
  syncOpenAiProviderUsage: (...args: unknown[]) => syncOpenAiProviderUsage(...args),
  inviteOrgMember: vi.fn(),
  updateOrgMember: vi.fn(),
  resetOrgMemberPassword: vi.fn(),
  removeOrgMember: vi.fn(),
}));

describe('AdminPage provider usage sync section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'owner';
    getOrgMembers.mockResolvedValue([]);
    getSystemDiagnostics.mockResolvedValue({});
    getGoogleProviderUsageStatus.mockResolvedValue({ sync_status: 'ready', missing_env_vars: [], billing_snapshot_missing: false, google_billing_sync_configured: true });
    getOpenAiProviderUsageSummary.mockResolvedValue({ sync_status: 'ready', last_sync_timestamp: '2026-03-20T11:30:00.000Z', project_id: 'proj_123' });
    syncGoogleProviderUsage.mockResolvedValue({ message: 'Google sync started.' });
    syncOpenAiProviderUsage.mockResolvedValue({ message: 'OpenAI sync started.' });
    getMetricsSummary.mockResolvedValue({
      total_cost_usd: 12.25,
      month_to_date_geocoding_calls: 14,
      reconciliation: { remaining_free_cap: { geocoding: 100 } },
    });
  });

  it('renders System status above Provider Usage for admin roles', async () => {
    authState.role = 'admin';
    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('System status')).toBeInTheDocument();
    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();
  });

  it('does not render System status for non-admin roles', async () => {
    authState.role = 'member';
    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Not authorized')).toBeInTheDocument();
  });

  it('renders admin cost transparency panel with month-to-date details', async () => {
    authState.role = 'admin';
    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Cost transparency')).toBeInTheDocument();
    expect(screen.getByText('Internal cost transparency')).toBeInTheDocument();
    expect(screen.getByText('Month-to-date geocoding usage')).toBeInTheDocument();
    expect(screen.getByText('Remaining free cap (Geocoding)')).toBeInTheDocument();
  });

  it('refreshes provider usage and triggers both sync buttons', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();
    const refreshButtons = await screen.findAllByRole('button', { name: 'Refresh' });
    await user.click(refreshButtons[0]);
    await waitFor(() => expect(getGoogleProviderUsageStatus).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Sync Google billing now' }));
    await waitFor(() => expect(syncGoogleProviderUsage).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Sync OpenAI usage now' }));
    await waitFor(() => expect(syncOpenAiProviderUsage).toHaveBeenCalledTimes(1));
  });
});
