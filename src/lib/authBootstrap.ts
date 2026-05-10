import type { Session } from '@supabase/supabase-js';
import { ensureFreshSession } from './sessionRefresh';
import { joinUrl } from './joinUrl';

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
