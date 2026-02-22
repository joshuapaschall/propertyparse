import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthControls } from '../App';
import { supabase } from '../lib/supabase';

export default function SetPasswordOnboardingPage() {
  const navigate = useNavigate();
  const { session, isAuthenticated, requiresPasswordSetup, refreshBootstrap } = useAuthControls();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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
      const currentMetadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data:
          currentMetadata.requires_password_setup === true
            ? { ...currentMetadata, requires_password_setup: false }
            : undefined,
      });

      if (updateError) {
        throw updateError;
      }

      await refreshBootstrap();
      setStatus('Password created. Redirecting...');
      navigate('/parse', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to set password.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!requiresPasswordSetup) {
    return <Navigate to="/parse" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Create your password</h1>
          <p className="text-sm text-white/70">Set your account password to continue into PropertyParse.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white/80" htmlFor="onboarding-password">
              New password
            </label>
            <input
              id="onboarding-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white/80" htmlFor="onboarding-confirm-password">
              Confirm password
            </label>
            <input
              id="onboarding-confirm-password"
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
            {isSubmitting ? 'Saving password...' : 'Continue'}
          </button>
        </form>
        {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
