import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import StatusIndicators from './StatusIndicators';
import { useAuthControls, useThemeControls } from '../App';

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

const navLinkBase =
  'rounded-full px-4 py-2 text-xs font-semibold transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white';

export default function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const { logout } = useAuthControls();
  const { theme, toggleTheme } = useThemeControls();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StatusIndicators />
            {actions}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {theme === 'dark' ? 'Light mode' : 'Night mode'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="uppercase tracking-wide">Navigate</span>
            <nav className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
              <NavLink
                to="/parse"
                className={({ isActive }) =>
                  `${navLinkBase} ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                  }`
                }
              >
                Parse
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `${navLinkBase} ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                  }`
                }
              >
                History
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${navLinkBase} ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                  }`
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
