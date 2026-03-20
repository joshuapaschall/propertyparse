import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      refreshSession: (...args: unknown[]) => refreshSession(...args),
    },
  },
}));

vi.mock('./pages/AuthPage', () => ({ default: () => null }));
vi.mock('./pages/AdminPage', () => ({ default: () => null }));
vi.mock('./pages/DashboardPage', () => ({ default: () => null }));
vi.mock('./pages/HistoryDetailPage', () => ({ default: () => null }));
vi.mock('./pages/HistoryPage', () => ({ default: () => null }));
vi.mock('./pages/ParsePage', () => ({ default: () => null }));
vi.mock('./pages/ResetPasswordPage', () => ({ default: () => null }));
vi.mock('./pages/AuthCallbackPage', () => ({ default: () => null }));
vi.mock('./pages/SetPasswordOnboardingPage', () => ({ default: () => null }));
vi.mock('./pages/AccountSecurityPage', () => ({ default: () => null }));
vi.mock('./components/ui/ToastProvider', () => ({ ToastProvider: ({ children }: { children: unknown }) => <>{children}</> }));
vi.mock('./lib/api', () => ({ acceptInvitation: vi.fn(), getMe: vi.fn() }));

describe('bootstrapAuthSessionRequest', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  it('retries auth bootstrap once with a refreshed session token', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('expired', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ orgId: 'org-1', userId: 'user-1', role: 'admin' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const { bootstrapAuthSessionRequest } = await import('./App');
    const result = await bootstrapAuthSessionRequest({ access_token: 'stale-token', user: { id: 'user-1' } } as any);

    expect(result.accessToken).toBe('fresh-token');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    });
  });
});
