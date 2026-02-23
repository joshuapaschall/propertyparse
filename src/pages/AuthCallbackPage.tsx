import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';
import { useAuthControls } from '../App';
import { acceptInvitation } from '../lib/api';
import { consumeSupabaseAuthRedirect } from '../lib/supabaseAuthRedirect';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshBootstrap } = useAuthControls();

  const [isInvalidLink, setIsInvalidLink] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const authResult = await consumeSupabaseAuthRedirect();

        if (!isMounted) return;

        if (!authResult.sessionEstablished) {
          setIsInvalidLink(true);
          return;
        }

        await refreshBootstrap();

        if (authResult.flow === 'invite') {
          await acceptInvitation();
          await refreshBootstrap();
          if (!isMounted) return;
          navigate('/welcome/set-password', { replace: true });
          return;
        }

        if (authResult.type === 'recovery') {
          navigate('/reset-password', { replace: true });
          return;
        }

        navigate('/parse', { replace: true });
      } catch (_error) {
        if (!isMounted) return;
        setIsInvalidLink(true);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [navigate, refreshBootstrap]);

  if (isInvalidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-xl font-semibold">Link invalid or expired</h1>
          <p className="mt-3 text-sm text-white/70">
            Please request a new authentication email and try again.
          </p>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <LoadingSpinner />
    </div>
  );
}
