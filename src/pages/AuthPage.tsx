import { useNavigate } from 'react-router-dom';
import { useAuthControls } from '../App';
import { getOrCreateOrgId, getOrCreateUserId } from '../lib/identity';

const features = [
  'Upload CSV, XLSX, PDF, image, or DOCX files.',
  'Set precise location context before parsing.',
  'Review matched and unmatched results instantly.',
  'Export clean CSVs for downstream workflows.',
];

export default function AuthPage() {
  const { login } = useAuthControls();
  const navigate = useNavigate();

  const handleLogin = () => {
    getOrCreateOrgId();
    getOrCreateUserId();
    login();
    navigate('/parse', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            PropertyParse Auth Shell
          </div>
          <h1 className="text-4xl font-semibold leading-tight">
            Sign in to launch the address parsing workspace.
          </h1>
          <p className="text-lg text-white/70">
            This is a ready-to-wire auth shell. Plug in Supabase authentication when available. For
            now, use the button below to simulate login and continue to the parsing workflow.
          </p>
          <button
            type="button"
            onClick={handleLogin}
            className="w-full sm:w-auto rounded-lg bg-white px-6 py-3 text-slate-900 font-semibold hover:bg-slate-100 transition"
          >
            Continue to PropertyParse
          </button>
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
            Supabase auth integration placeholder — swap this section with your actual login
            experience when ready.
          </div>
        </div>
      </div>
    </div>
  );
}
