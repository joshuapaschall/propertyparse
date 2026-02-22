import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';
import { supabase } from '../lib/supabase';
import { useAuthControls } from '../App';

const parseHashTokens = (hash: string) => {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(rawHash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return { accessToken, refreshToken };
};

export default function AuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    session,
    isSessionLoading,
    isAuthenticated,
    refreshBootstrap,
    acceptPendingInvitation,
  } = useAuthControls();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          const { accessToken, refreshToken } = parseHashTokens(window.location.hash);
          if (accessToken && refreshToken) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (setSessionError) {
              throw setSessionError;
            }
            window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
          }
        }

        await refreshBootstrap();

        const flow = params.get('flow');
        if (flow === 'invite') {
          await acceptPendingInvitation();
          await refreshBootstrap();
        }

        if (!isMounted) return;
        navigate('/welcome/set-password', { replace: true });
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Unable to complete authentication callback.';
        setError(message);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [acceptPendingInvitation, location.key, navigate, refreshBootstrap]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-xl font-semibold">Invite link issue</h1>
          <p className="mt-3 text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (!isSessionLoading && isAuthenticated && session) {
    return <Navigate to="/welcome/set-password" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <LoadingSpinner />
    </div>
  );
}
