import { supabase } from './supabase';


const ALLOWED_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const;

type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

const isAllowedOtpType = (value: string | null): value is AllowedOtpType =>
  value !== null && (ALLOWED_OTP_TYPES as readonly string[]).includes(value);

export type AuthRedirectResult = {
  sessionEstablished: boolean;
  flow?: string | null;
  type?: string | null;
  authError?: string | null;
  authErrorDescription?: string | null;
  debug?: {
    flow: string | null;
    type: string | null;
    hasTokenHash: boolean;
    hasCode: boolean;
    hasHashSessionTokens: boolean;
    hasExistingSession: boolean;
  };
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
  const authError = params.get('error');
  const authErrorDescription = params.get('error_description');

  const { data: sessionData } = await supabase.auth.getSession();
  const hasExistingSession = Boolean(sessionData.session);

  const { accessToken, refreshToken } = parseHashSession(window.location.hash);
  const hasHashSessionTokens = Boolean(accessToken && refreshToken);
  const debug = {
    flow,
    type,
    hasTokenHash: Boolean(tokenHash),
    hasCode: Boolean(code),
    hasHashSessionTokens,
    hasExistingSession,
  };

  if (authError || authErrorDescription) {
    return {
      sessionEstablished: false,
      flow,
      type,
      authError,
      authErrorDescription,
      debug,
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { sessionEstablished: false, flow, type, authErrorDescription: error.message, debug };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type, debug };
  }

  if (tokenHash && isAllowedOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return { sessionEstablished: false, flow, type, authErrorDescription: error.message, debug };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type, debug };
  }

  if (hasHashSessionTokens && accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { sessionEstablished: false, flow, type, authErrorDescription: error.message, debug };
    }
    clearUrlParams();
    return { sessionEstablished: true, flow, type, debug };
  }

  if (hasExistingSession) {
    return { sessionEstablished: true, flow, type, debug };
  }

  return { sessionEstablished: false, flow, type, debug };
}
