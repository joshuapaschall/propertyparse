import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeSupabaseAuthRedirect } from '../supabaseAuthRedirect';

const authMocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: authMocks.verifyOtp,
      exchangeCodeForSession: authMocks.exchangeCodeForSession,
      setSession: authMocks.setSession,
    },
  },
}));

describe('consumeSupabaseAuthRedirect', () => {
  beforeEach(() => {
    authMocks.verifyOtp.mockReset();
    authMocks.exchangeCodeForSession.mockReset();
    authMocks.setSession.mockReset();
    authMocks.verifyOtp.mockResolvedValue({ error: null });
    authMocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    authMocks.setSession.mockResolvedValue({ error: null });
    window.history.replaceState({}, document.title, '/auth/callback');
  });

  it('attempts verifyOtp when token_hash and type are present', async () => {
    window.history.replaceState({}, document.title, '/auth/callback?token_hash=abc123&type=invite&flow=invite');

    await consumeSupabaseAuthRedirect();

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'invite' });
    expect(authMocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('attempts exchangeCodeForSession when code is present', async () => {
    window.history.replaceState({}, document.title, '/auth/callback?code=oauth-code&flow=login');

    await consumeSupabaseAuthRedirect();

    expect(authMocks.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
  });
});
