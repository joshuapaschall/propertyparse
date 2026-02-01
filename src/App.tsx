import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import HistoryPage from './pages/HistoryPage';
import ParsePage from './pages/ParsePage';
import LoadingSpinner from './LoadingSpinner';
import { clearAuthHeaderState, setAuthHeaderState } from './lib/authState';
import { supabase } from './lib/supabase';
import './App.css';

type AuthContextValue = {
  session: Session | null;
  accessToken: string | null;
  orgId: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  isSessionLoading: boolean;
  isBootstrapping: boolean;
  bootstrapError: string | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithMagicLink: (email: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
};

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  toggleTheme: () => void;
};

type BootstrapResponse = {
  orgId: string;
  userId: string;
  role: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const bootstrapSession = useCallback(async (currentSession: Session) => {
    setIsBootstrapping(true);
    setBootstrapError(null);
    try {
      const res = await fetch(joinUrl('/auth/bootstrap'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Bootstrap failed with ${res.status}`);
      }
      const data = (await res.json()) as BootstrapResponse;
      setOrgId(data.orgId);
      setUserId(data.userId);
      setRole(data.role);
      setAuthHeaderState({
        accessToken: currentSession.access_token,
        orgId: data.orgId,
        userId: data.userId,
        role: data.role,
      });
      window.localStorage.setItem('pp-role', data.role);
      window.localStorage.setItem('pp-user-role', data.role);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to bootstrap session.';
      setBootstrapError(message);
      setOrgId(null);
      setUserId(null);
      setRole(null);
      clearAuthHeaderState();
      window.localStorage.removeItem('pp-role');
      window.localStorage.removeItem('pp-user-role');
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
    if (session) {
      bootstrapSession(session);
    } else {
      setOrgId(null);
      setUserId(null);
      setRole(null);
      setBootstrapError(null);
      setIsBootstrapping(false);
      clearAuthHeaderState();
      window.localStorage.removeItem('pp-role');
      window.localStorage.removeItem('pp-user-role');
    }
  }, [session, bootstrapSession]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const loginWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      throw error;
    }
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
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
    setBootstrapError(null);
    clearAuthHeaderState();
    window.localStorage.removeItem('pp-role');
    window.localStorage.removeItem('pp-user-role');
  }, []);

  const refreshBootstrap = useCallback(async () => {
    if (!session) return;
    await bootstrapSession(session);
  }, [bootstrapSession, session]);

  const accessToken = session?.access_token ?? null;
  const isAuthenticated = Boolean(session);
  const isReady = Boolean(session && orgId && userId && role && !isBootstrapping);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      accessToken,
      orgId,
      userId,
      role,
      isAuthenticated,
      isReady,
      isSessionLoading,
      isBootstrapping,
      bootstrapError,
      loginWithPassword,
      loginWithMagicLink,
      signUpWithPassword,
      logout,
      refreshBootstrap,
    }),
    [
      session,
      accessToken,
      orgId,
      userId,
      role,
      isAuthenticated,
      isReady,
      isSessionLoading,
      isBootstrapping,
      bootstrapError,
      loginWithPassword,
      loginWithMagicLink,
      signUpWithPassword,
      logout,
      refreshBootstrap,
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
  } = useAuth();

  if (isSessionLoading || (isAuthenticated && isBootstrapping)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-xl font-semibold">We hit a snag preparing your workspace.</h2>
          <p className="mt-3 text-sm text-white/70">
            {bootstrapError ?? 'Unable to load your org context. Please retry.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void refreshBootstrap()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Retry bootstrap
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
  const { isAuthenticated, isReady, isSessionLoading, isBootstrapping } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && isReady) {
      navigate('/parse', { replace: true });
    }
  }, [isAuthenticated, isReady, navigate]);

  if (isSessionLoading || (isAuthenticated && isBootstrapping)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <LoadingSpinner />
      </div>
    );
  }

  return <AuthPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginGate />} />
      <Route path="/login" element={<LoginGate />} />
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
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
