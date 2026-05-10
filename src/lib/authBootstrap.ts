import type { Session } from '@supabase/supabase-js';
import { ensureFreshSession } from './sessionRefresh';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

export type BootstrapSuccessResponse = {
  orgId: string;
  userId: string;
  role: string;
};

export type BootstrapGuidanceResponse = {
  noMembership: true;
  hasPendingInvitation: boolean;
  invitation?: {
    orgId?: string;
    orgName?: string;
    email?: string;
    role?: string;
  };
};

export type BootstrapResponse = BootstrapSuccessResponse | BootstrapGuidanceResponse;

export const isBootstrapGuidance = (
  resp: BootstrapResponse,
): resp is BootstrapGuidanceResponse =>
  'noMembership' in resp && resp.noMembership === true;

export const bootstrapAuthSessionRequest = async (currentSession: Session) => {
  const executeBootstrap = async (accessToken: string) =>
    fetch(joinUrl('/auth/bootstrap'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let accessToken = currentSession.access_token;
  let response = await executeBootstrap(accessToken);

  if (response.status === 401 || response.status === 403) {
    const refreshed = await ensureFreshSession(accessToken);
    accessToken = refreshed.accessToken;
    response = await executeBootstrap(accessToken);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Bootstrap failed with ${response.status}`);
  }

  return {
    data: (await response.json()) as BootstrapResponse,
    accessToken,
  };
};
