import { supabase } from './supabase';

export type AuthRedirectResult = {
  sessionEstablished: boolean;
  flow?: string | null;
  type?: string | null;
};

const parseHashSession = (hash: string) => {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(rawHash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return { accessToken, refreshToken };
};

const clearUrlParams = () => {
  const cleanPath = window.location.pathname;
  window.history.replaceState({}, document.title, cleanPath);
};

export async function consumeSupabaseAuthRedirect(): Promise<AuthRedirectResult> {
  const params = new URLSearchParams(window.location.search);
  const flow = params.get('flow');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const code = params.get('code');

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return { sessionEstablished: false, flow, type };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { sessionEstablished: false, flow, type };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type };
  }

  const { accessToken, refreshToken } = parseHashSession(window.location.hash);
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { sessionEstablished: false, flow, type };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type };
  }

  return { sessionEstablished: false, flow, type };
}
