import { supabase } from './supabase';
import { getAuthHeaderState, mergeAuthHeaderState } from './authState';

export const AUTH_FAILURE_MESSAGE = 'We couldn’t verify your session. Sign in again.';
export const MEMBERSHIP_LOST_MESSAGE =
  'Your access to this workspace was removed. Contact your admin to be re-invited.';
export const AUTH_REFRESHING_MESSAGE = 'Refreshing your session…';

export type RefreshedSessionContext = {
  accessToken: string;
  userId: string | null;
};

export const ensureFreshSession = async (fallbackAccessToken?: string | null): Promise<RefreshedSessionContext> => {
  const refreshResult = await supabase.auth.refreshSession();
  const refreshedSession = refreshResult.data.session;

  if (refreshResult.error || !refreshedSession?.access_token) {
    throw new Error(AUTH_FAILURE_MESSAGE);
  }

  const accessToken = refreshedSession.access_token;
  const userId = refreshedSession.user?.id ?? getAuthHeaderState().userId ?? null;

  mergeAuthHeaderState({
    accessToken,
    userId,
  });

  if (fallbackAccessToken && fallbackAccessToken === accessToken) {
    return { accessToken, userId };
  }

  return { accessToken, userId };
};
