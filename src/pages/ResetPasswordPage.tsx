import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthControls } from '../App';
import { consumeSupabaseAuthRedirect } from '../lib/supabaseAuthRedirect';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refreshBootstrap } = useAuthControls();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const hasRedirectTokens =
        (Boolean(params.get('token_hash')) && Boolean(params.get('type'))) || Boolean(params.get('code'));

      if (hasRedirectTokens) {
        await consumeSupabaseAuthRedirect();
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (sessionError) {
        setError(sessionError.message);
        setHasRecoverySession(false);
        return;
      }

      setHasRecoverySession(Boolean(data.session));
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }
      setStatus('Password updated. Redirecting...');
      await refreshBootstrap();
      navigate('/parse', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update password.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasRecoverySession === false) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
          <h1 className="text-2xl font-semibold">Reset link issue</h1>
          <p className="text-sm text-white/70">
            This reset link is invalid or expired. Go back to login.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-slate-900"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Set a new password</h1>
          <p className="text-sm text-white/70">
            Enter a new password to complete your reset.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white/80" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white/80" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-white px-6 py-3 text-slate-900 font-semibold hover:bg-slate-100 transition disabled:opacity-60"
          >
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </button>
        </form>
        {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
