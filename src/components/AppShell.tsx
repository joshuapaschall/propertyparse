import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import StatusIndicators from './StatusIndicators';
import { useAuthControls } from '../App';

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

const navLinkBase =
  'rounded-full px-4 py-2 text-xs font-semibold transition hover:bg-slate-100 hover:text-slate-900';

export default function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const { logout } = useAuthControls();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StatusIndicators />
            {actions}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3 text-xs font-semibold text-slate-500">
            <span className="uppercase tracking-wide">Navigate</span>
            <nav className="flex flex-wrap items-center gap-2 text-slate-600">
              <NavLink
                to="/parse"
                className={({ isActive }) =>
                  `${navLinkBase} ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600'}`
                }
              >
                Parse
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `${navLinkBase} ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600'}`
                }
              >
                History
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${navLinkBase} ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600'}`
                }
              >
                Admin
              </NavLink>
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
