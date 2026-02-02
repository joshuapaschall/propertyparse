import { useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthControls } from '../App';

const features = [
  'Upload CSV, XLSX, PDF, image, or DOCX files.',
  'Set precise location context before parsing.',
  'Review matched and unmatched results instantly.',
  'Export clean CSVs for downstream workflows.',
];

type AuthMode = 'sign-in' | 'create-account';

type AuthErrorInfo = {
  message: string;
  details?: string;
  code?: string;
  isUnconfirmedEmail?: boolean;
};

const isNetworkError = (message: string) =>
  ['failed to fetch', 'network', 'timeout', 'timed out', 'networkerror'].some((token) =>
    message.toLowerCase().includes(token),
  );

const normalizeAuthError = (error: unknown): AuthErrorInfo => {
  if (!error) {
    return { message: 'Unable to sign in.' };
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unable to sign in.';

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined;

  if (message.toLowerCase().includes('invalid login credentials')) {
    return {
      message: 'Incorrect email or password. Try resetting your password.',
      details: message,
      code,
    };
  }

  if (message.toLowerCase().includes('email not confirmed') || message.toLowerCase().includes('confirm')) {
    return {
      message: 'Please confirm your email. You can resend the confirmation email.',
      details: message,
      code,
      isUnconfirmedEmail: true,
    };
  }

  if (isNetworkError(message)) {
    return {
      message: 'Network error. Please try again.',
      details: message,
      code,
    };
  }

  return {
    message,
    details: message,
    code,
  };
};

const redactSupabaseUrl = (url: string | undefined) => {
  if (!url) return 'unknown';
  const trimmed = url.trim();
  if (trimmed.length <= 6) return trimmed;
  return `••••••${trimmed.slice(-6)}`;
};

export default function AuthPage() {
  const { loginWithPassword, loginWithMagicLink, signUpWithPassword, session } = useAuthControls();
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [lastAuthError, setLastAuthError] = useState<{ code?: string; message?: string } | null>(null);
  const [showDetails, setShowDetails] = useState(import.meta.env.DEV);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);

  const diagnostics = useMemo(
    () => ({
      supabaseUrl: redactSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined),
      hasSession: session ? 'yes' : 'no',
      lastError: lastAuthError ? `${lastAuthError.code ?? 'unknown'} — ${lastAuthError.message}` : 'none',
    }),
    [lastAuthError, session],
  );

  const resetAuthFeedback = () => {
    setStatus(null);
    setError(null);
    setErrorDetails(null);
    setShowResendConfirmation(false);
  };

  const handleAuthError = (err: unknown, fallback: string) => {
    const normalized = normalizeAuthError(err);
    setError(normalized.message || fallback);
    setErrorDetails(normalized.details ?? null);
    setLastAuthError({ code: normalized.code, message: normalized.details ?? normalized.message });
    setShowResendConfirmation(Boolean(normalized.isUnconfirmedEmail));
  };

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetAuthFeedback();
    setResetStatus(null);
    setResetError(null);
    setIsSubmitting(true);
    try {
      await loginWithPassword(email, password);
      setStatus('Signed in successfully. Redirecting...');
    } catch (err) {
      handleAuthError(err, 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    resetAuthFeedback();
    setResetStatus(null);
    setResetError(null);
    setIsSubmitting(true);
    try {
      await loginWithMagicLink(email);
      setStatus('Magic link sent! Check your inbox to finish signing in.');
    } catch (err) {
      handleAuthError(err, 'Unable to send magic link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetAuthFeedback();
    setResetStatus(null);
    setResetError(null);
    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUpWithPassword(email, password);
      if (needsEmailConfirmation) {
        setStatus('Check your email to confirm your account.');
      } else {
        setStatus('Account created! Redirecting...');
      }
    } catch (err) {
      handleAuthError(err, 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setResetError(null);
    setResetStatus(null);
    setIsResetting(true);
    try {
      const { error: resetErrorResponse } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetErrorResponse) {
        throw resetErrorResponse;
      }
      setResetStatus('Check your email for a password reset link.');
    } catch (err) {
      const normalized = normalizeAuthError(err);
      setResetError(normalized.message || 'Unable to send password reset email.');
      setErrorDetails(normalized.details ?? null);
      setLastAuthError({ code: normalized.code, message: normalized.details ?? normalized.message });
    } finally {
      setIsResetting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setIsResendingConfirmation(true);
    resetAuthFeedback();
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
      if (resendError) {
        throw resendError;
      }
      setStatus('Confirmation email resent.');
    } catch (err) {
      handleAuthError(err, 'Unable to resend confirmation email.');
    } finally {
      setIsResendingConfirmation(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            PropertyParse Secure Login
          </div>
          <h1 className="text-4xl font-semibold leading-tight">
            {authMode === 'sign-in'
              ? 'Sign in to launch the address parsing workspace.'
              : 'Create your PropertyParse account to get started.'}
          </h1>
          <p className="text-lg text-white/70">
            {authMode === 'sign-in'
              ? 'Use your Supabase credentials to access PropertyParse. Magic links are available if you prefer passwordless sign-in.'
              : 'Create an account with email and password. We will send a confirmation link if required.'}
          </p>
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setAuthMode('sign-in');
                resetAuthFeedback();
                setResetStatus(null);
                setResetError(null);
                setShowForgotPassword(false);
              }}
              className={`rounded-full px-4 py-1.5 font-semibold transition ${
                authMode === 'sign-in' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('create-account');
                resetAuthFeedback();
                setResetStatus(null);
                setResetError(null);
                setShowForgotPassword(false);
              }}
              className={`rounded-full px-4 py-1.5 font-semibold transition ${
                authMode === 'create-account'
                  ? 'bg-white text-slate-900'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Create account
            </button>
          </div>
          <form
            onSubmit={authMode === 'sign-in' ? handlePasswordLogin : handleCreateAccount}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white/80" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white/80" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
                placeholder="••••••••"
                required
              />
              {authMode === 'sign-in' ? (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword((prev) => !prev);
                      setResetStatus(null);
                      setResetError(null);
                      setResetEmail(email);
                    }}
                    className="text-xs text-white/70 hover:text-white"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : null}
            </div>
            {authMode === 'sign-in' && showForgotPassword ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Reset your password</p>
                    <p className="text-xs text-white/60">
                      We will email a reset link to the address below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <label className="text-xs font-semibold text-white/70" htmlFor="reset-email">
                  Email for reset
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
                  placeholder="you@company.com"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isResetting || !resetEmail}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                  >
                    {isResetting ? 'Sending reset link...' : 'Send reset link'}
                  </button>
                  {resetStatus ? <span className="text-xs text-emerald-300">{resetStatus}</span> : null}
                  {resetError ? <span className="text-xs text-red-300">{resetError}</span> : null}
                </div>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-lg bg-white px-6 py-3 text-slate-900 font-semibold hover:bg-slate-100 transition disabled:opacity-60"
            >
              {isSubmitting
                ? authMode === 'sign-in'
                  ? 'Signing in...'
                  : 'Creating account...'
                : authMode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          {authMode === 'sign-in' ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={isSubmitting || !email}
                className="rounded-lg border border-white/20 px-5 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60"
              >
                Send magic link
              </button>
              <span className="text-xs text-white/50">No password needed — check your email.</span>
            </div>
          ) : null}
          {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-300">{error}</p>
              {showResendConfirmation ? (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResendingConfirmation || !email}
                  className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition disabled:opacity-60"
                >
                  {isResendingConfirmation ? 'Resending confirmation...' : 'Resend confirmation email'}
                </button>
              ) : null}
              {errorDetails && (showDetails || import.meta.env.DEV) ? (
                <p className="text-xs text-red-200/80">Details: {errorDetails}</p>
              ) : null}
              {errorDetails && !import.meta.env.DEV ? (
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="text-xs text-white/60 hover:text-white"
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
              ) : null}
            </div>
          ) : null}
          {import.meta.env.DEV ? (
            <details className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              <summary className="cursor-pointer font-semibold text-white/80">Diagnostics</summary>
              <div className="mt-2 space-y-1">
                <div>Supabase URL: {diagnostics.supabaseUrl}</div>
                <div>Has session: {diagnostics.hasSession}</div>
                <div>Last auth error: {diagnostics.lastError}</div>
              </div>
            </details>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold mb-4">What you can do next</h2>
          <ul className="space-y-3 text-white/70">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-emerald-400" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-white/60">
            Log in to receive your org context and start parsing with secure headers.
          </div>
        </div>
      </div>
    </div>
  );
}
