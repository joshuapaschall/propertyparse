import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import HistoryPage from './pages/HistoryPage';
import ParsePage from './pages/ParsePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import SetPasswordOnboardingPage from './pages/SetPasswordOnboardingPage';
import AccountSecurityPage from './pages/AccountSecurityPage';
import LoadingSpinner from './LoadingSpinner';
import { ToastProvider } from './components/ui/ToastProvider';
import { acceptInvitation, getMe } from './lib/api';
import { clearAuthHeaderState, setAuthHeaderState } from './lib/authState';
import { supabase } from './lib/supabase';
import { getSiteUrl } from './lib/siteUrl';
import './App.css';

type AuthContextValue = {
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

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  toggleTheme: () => void;
};

type BootstrapSuccessResponse = {
  orgId: string;
  userId: string;
  role: string;
};

type BootstrapGuidanceResponse = {
  noMembership: true;
  hasPendingInvitation: boolean;
  invitation?: {
    orgId?: string;
    orgName?: string;
    email?: string;
    role?: string;
  };
};

type BootstrapResponse = BootstrapSuccessResponse | BootstrapGuidanceResponse;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);


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
    const { data, error } = await supabase.auth.getSession();
    const refreshedToken = data.session?.access_token;
    if (!error && refreshedToken && refreshedToken !== accessToken) {
      accessToken = refreshedToken;
      response = await executeBootstrap(accessToken);
    }
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

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return ctx;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<BootstrapGuidanceResponse['invitation'] | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const bootstrapSession = useCallback(async (currentSession: Session) => {
    setIsBootstrapping(true);
    setBootstrapError(null);
    try {
      const { data, accessToken } = await bootstrapAuthSessionRequest(currentSession);
      if ('noMembership' in data && data.noMembership) {
        setOrgId(null);
        setUserId(null);
        setRole(null);
        setPendingInvitation(data.invitation ?? null);
        setBootstrapError(
          data.hasPendingInvitation
            ? 'You have an invitation waiting. Accept to continue.'
            : 'No organization found for your account. Contact your admin or create an org.',
        );
        setAuthHeaderState({
          accessToken,
          orgId: null,
          userId: currentSession.user.id,
          role: null,
        });
        return;
      }

      setPendingInvitation(null);
      setAuthHeaderState({
        accessToken,
        orgId: data.orgId,
        userId: data.userId,
        role: data.role,
      });
      const me = await getMe();
      setOrgId(me.orgId);
      setUserId(me.userId);
      setRole(me.role);
      setAuthHeaderState({
        accessToken,
        orgId: me.orgId,
        userId: me.userId,
        role: me.role,
      });
      setBootstrapError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to bootstrap session.';
      setBootstrapError(message);
      setOrgId(null);
      setUserId(null);
      setRole(null);
      setPendingInvitation(null);
      clearAuthHeaderState();
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.error('Supabase session error:', error.message);
      }
      setSession(data.session ?? null);
      setIsSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsSessionLoading(false);
    });
    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setOrgId(null);
      setUserId(null);
      setRole(null);
      setPendingInvitation(null);
      setBootstrapError(null);
      setIsBootstrapping(false);
      clearAuthHeaderState();
      return;
    }

    if (orgId && userId && role) {
      setAuthHeaderState({
        accessToken: session.access_token,
        orgId,
        userId,
        role,
      });
      return;
    }

    bootstrapSession(session);
  }, [session, orgId, userId, role, bootstrapSession]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const loginWithMagicLink = useCallback(async (email: string, emailRedirectTo?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: emailRedirectTo ?? `${getSiteUrl()}/auth/callback` },
    });
    if (error) {
      throw error;
    }
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
    });
    if (error) {
      throw error;
    }
    if (data.session) {
      setSession(data.session);
    }
    return { needsEmailConfirmation: !data.session };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOrgId(null);
    setUserId(null);
    setRole(null);
    setPendingInvitation(null);
    setBootstrapError(null);
    clearAuthHeaderState();
  }, []);

  const refreshBootstrap = useCallback(async () => {
    if (!session) return;
    await bootstrapSession(session);
  }, [bootstrapSession, session]);

  const acceptPendingInvitation = useCallback(async () => {
    await acceptInvitation();
    await refreshBootstrap();
  }, [refreshBootstrap]);

  const accessToken = session?.access_token ?? null;
  const isAuthenticated = Boolean(session);
  const hasOrgContext = Boolean(orgId && userId && role);
  const isReady = Boolean(session && hasOrgContext);
  const hasPendingInvitation =
    bootstrapError === 'You have an invitation waiting. Accept to continue.';
  const requiresPasswordSetup = session?.user.user_metadata?.requires_password_setup === true;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      accessToken,
      orgId,
      userId,
      role,
      pendingInvitation,
      isAuthenticated,
      isReady,
      isSessionLoading,
      isBootstrapping,
      bootstrapError,
      hasPendingInvitation,
      requiresPasswordSetup,
      loginWithPassword,
      loginWithMagicLink,
      signUpWithPassword,
      logout,
      refreshBootstrap,
      acceptPendingInvitation,
    }),
    [
      session,
      accessToken,
      orgId,
      userId,
      role,
      pendingInvitation,
      isAuthenticated,
      isReady,
      isSessionLoading,
      isBootstrapping,
      bootstrapError,
      hasPendingInvitation,
      requiresPasswordSetup,
      loginWithPassword,
      loginWithMagicLink,
      signUpWithPassword,
      logout,
      refreshBootstrap,
      acceptPendingInvitation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem('pp-theme') as ThemeMode | null;
    if (stored) return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('pp-theme', theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated,
    isReady,
    isSessionLoading,
    isBootstrapping,
    bootstrapError,
    refreshBootstrap,
    logout,
    hasPendingInvitation,
    pendingInvitation,
    acceptPendingInvitation,
    requiresPasswordSetup,
  } = useAuth();
  const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);
  const [acceptInvitationError, setAcceptInvitationError] = useState<string | null>(null);

  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiresPasswordSetup) {
    return <Navigate to="/welcome/set-password" replace />;
  }

  if (!isReady) {
    if (isBootstrapping) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
          <LoadingSpinner />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-xl font-semibold">We hit a snag preparing your workspace.</h2>
          <p className="mt-3 text-sm text-white/70">
            {bootstrapError ?? 'Unable to load your org context. Please retry.'}
          </p>
          {hasPendingInvitation ? (
            <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-left text-sm text-emerald-100">
              <p className="font-semibold">Invitation details</p>
              <p className="mt-1 text-emerald-100/80">Org: {pendingInvitation?.orgName ?? pendingInvitation?.orgId ?? 'Unknown org'}</p>
              {pendingInvitation?.role ? <p className="text-emerald-100/80">Role: {pendingInvitation.role}</p> : null}
            </div>
          ) : null}
          {acceptInvitationError ? <p className="mt-4 text-sm text-red-300">{acceptInvitationError}</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {hasPendingInvitation ? (
              <button
                type="button"
                onClick={async () => {
                  setAcceptInvitationError(null);
                  setIsAcceptingInvitation(true);
                  try {
                    await acceptPendingInvitation();
                  } catch (error) {
                    setAcceptInvitationError(error instanceof Error ? error.message : 'Unable to accept invitation.');
                  } finally {
                    setIsAcceptingInvitation(false);
                  }
                }}
                className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950"
                disabled={isAcceptingInvitation}
              >
                {isAcceptingInvitation ? 'Accepting invitation...' : 'Accept invitation'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshBootstrap()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function LoginGate() {
  const {
    isAuthenticated,
    isReady,
    isSessionLoading,
    isBootstrapping,
    bootstrapError,
    refreshBootstrap,
    logout,
    hasPendingInvitation,
    acceptPendingInvitation,
    requiresPasswordSetup,
  } = useAuth();
  const navigate = useNavigate();
  const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);
  const [acceptInvitationError, setAcceptInvitationError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && requiresPasswordSetup) {
      navigate('/welcome/set-password', { replace: true });
      return;
    }
    if (isAuthenticated && isReady) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isReady, navigate, requiresPasswordSetup]);

  if (isSessionLoading || (isAuthenticated && isBootstrapping)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <LoadingSpinner />
      </div>
    );
  }

  if (isAuthenticated && !isReady && !isBootstrapping && bootstrapError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold">Signed in, but workspace setup failed</h2>
          <pre className="mt-4 max-h-60 overflow-auto rounded-lg border border-white/10 bg-slate-900/60 p-4 text-sm text-red-200 whitespace-pre-wrap break-words">
            {bootstrapError}
          </pre>
          {acceptInvitationError ? <p className="mt-4 text-sm text-red-300">{acceptInvitationError}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {hasPendingInvitation ? (
              <button
                type="button"
                onClick={async () => {
                  setAcceptInvitationError(null);
                  setIsAcceptingInvitation(true);
                  try {
                    await acceptPendingInvitation();
                  } catch (error) {
                    setAcceptInvitationError(error instanceof Error ? error.message : 'Unable to accept invitation.');
                  } finally {
                    setIsAcceptingInvitation(false);
                  }
                }}
                className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950"
                disabled={isAcceptingInvitation}
              >
                {isAcceptingInvitation ? 'Accepting invitation...' : 'Accept invitation'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshBootstrap()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold"
            >
              Sign out
            </button>
            <a
              href={joinUrl('/system/diagnostics')}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Open API diagnostics
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <AuthPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginGate />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/welcome/set-password" element={<SetPasswordOnboardingPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parse"
        element={
          <ProtectedRoute>
            <ParsePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <HistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history/:jobId"
        element={
          <ProtectedRoute>
            <HistoryDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account/security"
        element={
          <ProtectedRoute>
            <AccountSecurityPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export function useAuthControls() {
  return useAuth();
}

export function useThemeControls() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeControls must be used within ThemeProvider.');
  }
  return ctx;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
