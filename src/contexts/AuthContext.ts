import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { BootstrapGuidanceResponse } from '../lib/authBootstrap';

export type AuthContextValue = {
  session: Session | null;
  accessToken: string | null;
  orgId: string | null;
  userId: string | null;
  role: string | null;
  pendingInvitation: BootstrapGuidanceResponse['invitation'] | null;
  isAuthenticated: boolean;
  isReady: boolean;
  isSessionLoading: boolean;
  isBootstrapping: boolean;
  bootstrapError: string | null;
  hasPendingInvitation: boolean;
  requiresPasswordSetup: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithMagicLink: (email: string, emailRedirectTo?: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  acceptPendingInvitation: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuthControls(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthControls must be used within AuthProvider.');
  }
  return ctx;
}
