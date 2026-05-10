import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from './AdminPage';

const getOrgMembers = vi.fn();
const getSystemDiagnostics = vi.fn();
const getGoogleProviderUsageStatus = vi.fn();
const getOpenAiProviderUsageSummary = vi.fn();
const syncGoogleProviderUsage = vi.fn();
const syncOpenAiProviderUsage = vi.fn();
const showToast = vi.fn();
const authState = { role: 'owner' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
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
    getGoogleProviderUsageStatus.mockResolvedValue({
      sync_status: 'ready',
      pricing_source: 'billing_export',
      pricing_confidence: 'high',
      billing_snapshot_as_of: '2026-03-20T12:00:00.000Z',
      snapshot_rows_count: 22,
      remaining_free_cap_status_mode: 'billing_truth',
      missing_env_vars: [],
      billing_snapshot_missing: false,
      google_billing_sync_configured: true,
    });
    getOpenAiProviderUsageSummary.mockResolvedValue({
      sync_status: 'ready',
      last_sync_timestamp: '2026-03-20T11:30:00.000Z',
      project_id: 'proj_123',
    });
    syncGoogleProviderUsage.mockResolvedValue({ message: 'Google sync started.' });
    syncOpenAiProviderUsage.mockResolvedValue({ message: 'OpenAI sync started.' });
  });

  it('renders the provider usage cards and local-only explanation details', async () => {
    getGoogleProviderUsageStatus.mockResolvedValueOnce({
      sync_status: 'missing_snapshot',
      pricing_source: 'local_estimate',
      pricing_confidence: 'low',
      billing_snapshot_as_of: null,
      snapshot_rows_count: 0,
      remaining_free_cap_status_mode: 'local_only',
      missing_env_vars: ['GOOGLE_CLOUD_PROJECT_ID', 'GOOGLE_BILLING_ACCOUNT_ID'],
      billing_snapshot_missing: true,
      google_billing_sync_configured: false,
    });

    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Billing snapshot missing.')).toBeInTheDocument();
    expect(screen.getByText(/Missing env vars: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_BILLING_ACCOUNT_ID/i)).toBeInTheDocument();
    expect(screen.getByText(/Project-local request logging is working, but billing-account sync has not populated provider snapshots yet/i)).toBeInTheDocument();
    expect(screen.getByText('proj_123')).toBeInTheDocument();
  });


  it('accepts alias config fields and shows awaiting data when billing export is configured without a snapshot', async () => {
    getGoogleProviderUsageStatus.mockResolvedValueOnce({
      sync_status: 'awaiting_snapshot',
      pricing_source: 'billing_export',
      pricing_confidence: 'high',
      billing_snapshot_as_of: null,
      snapshot_rows_count: 0,
      remaining_free_cap_status_mode: 'local_only',
      missing_config_env_vars: [],
      billing_snapshot_missing: true,
      billing_sync_configured: true,
    });

    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();
    expect(await screen.findByText('Billing export configured, awaiting current provider data.')).toBeInTheDocument();
    expect(screen.queryByText(/Project-local request logging is working/i)).not.toBeInTheDocument();
  });

  it('keeps provider cards independent when one provider status request fails', async () => {
    getGoogleProviderUsageStatus.mockRejectedValueOnce({
      apiErrorInfo: { message: 'Google failed', endpoint: '/admin/provider-usage/google/status', status: 503 },
    });

    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByText('Google provider usage status could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Google failed')).toBeInTheDocument();
    expect(screen.getByText('proj_123')).toBeInTheDocument();
  });


  it('rejects invites with malformed email addresses before calling the API (B63)', async () => {
    const user = userEvent.setup();
    const inviteOrgMember = (await import('../lib/api')).inviteOrgMember as ReturnType<typeof vi.fn>;
    inviteOrgMember.mockClear();

    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/first name/i), 'Test');
    await user.type(screen.getByPlaceholderText(/last name/i), 'User');
    await user.type(screen.getByPlaceholderText(/name@company.com/i), 'test@localhost');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(inviteOrgMember).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Please enter a valid email address.',
        variant: 'error',
      }),
    );
  });

  it('opens a confirm dialog before removing a team member (B62)', async () => {
    const user = userEvent.setup();
    const removeOrgMember = (await import('../lib/api')).removeOrgMember as ReturnType<typeof vi.fn>;
    removeOrgMember.mockClear();
    removeOrgMember.mockResolvedValue(undefined);
    getOrgMembers.mockResolvedValueOnce([
      { user_id: 'u1', email: 'gone@example.com', role: 'member', first_name: 'A', last_name: 'B' },
    ]);

    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /^remove$/i }));

    expect(removeOrgMember).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('gone@example.com');

    const confirmButton = screen.getAllByRole('button', { name: /^remove$/i }).at(-1);
    if (!confirmButton) throw new Error('confirm button missing');
    await user.click(confirmButton);

    expect(removeOrgMember).toHaveBeenCalledWith('u1');
  });

  it('refreshes provider usage and triggers both sync buttons with loading-safe handlers', async () => {
    const user = userEvent.setup();

    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(await screen.findByText('Provider Usage')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(getGoogleProviderUsageStatus).toHaveBeenCalledTimes(2);
      expect(getOpenAiProviderUsageSummary).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('button', { name: 'Sync Google billing now' }));
    await waitFor(() => expect(syncGoogleProviderUsage).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Sync OpenAI usage now' }));
    await waitFor(() => expect(syncOpenAiProviderUsage).toHaveBeenCalledTimes(1));

    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google sync started.', variant: 'success' }));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'OpenAI sync started.', variant: 'success' }));
  });
});
