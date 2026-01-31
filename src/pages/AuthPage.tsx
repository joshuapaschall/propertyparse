import { useState, type FormEvent } from 'react';
import { useAuthControls } from '../App';

const features = [
  'Upload CSV, XLSX, PDF, image, or DOCX files.',
  'Set precise location context before parsing.',
  'Review matched and unmatched results instantly.',
  'Export clean CSVs for downstream workflows.',
];

export default function AuthPage() {
  const { loginWithPassword, loginWithMagicLink } = useAuthControls();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);
    try {
      await loginWithPassword(email, password);
      setStatus('Signed in successfully. Redirecting...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    setError(null);
    setStatus(null);
    setIsSubmitting(true);
    try {
      await loginWithMagicLink(email);
      setStatus('Magic link sent! Check your inbox to finish signing in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send magic link.');
    } finally {
      setIsSubmitting(false);
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
          <h1 className="text-4xl font-semibold leading-tight">Sign in to launch the address parsing workspace.</h1>
          <p className="text-lg text-white/70">
            Use your Supabase credentials to access PropertyParse. Magic links are available if you
            prefer passwordless sign-in.
          </p>
          <form onSubmit={handlePasswordLogin} className="space-y-4">
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
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-lg bg-white px-6 py-3 text-slate-900 font-semibold hover:bg-slate-100 transition disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
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
          {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
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
