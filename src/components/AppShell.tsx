import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthControls } from '../contexts/AuthContext';
import { useThemeControls } from '../contexts/ThemeContext';

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  contentFullWidth?: boolean;
  density?: 'comfortable' | 'wide';
};

type NavItem = {
  label: string;
  to: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
    ),
  },
  {
    label: 'Parse',
    to: '/parse',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v4h4" />
      </svg>
    ),
  },
  {
    label: 'History',
    to: '/history',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v4h4" />
      </svg>
    ),
  },
];


const adminNavItem: NavItem = {
  label: 'Admin',
  to: '/admin',
  icon: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  ),
};

const navLinkBase =
  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition';

export default function AppShell({ title, subtitle, actions, children, contentFullWidth = false, density = 'comfortable' }: AppShellProps) {
  const { logout, role } = useAuthControls();
  const { theme, toggleTheme } = useThemeControls();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canAccessAdmin = role === 'admin' || role === 'owner';
  const visibleNavItems = canAccessAdmin ? [...navItems, adminNavItem] : navItems;

  const renderNavLinks = () => (
    <nav className="space-y-1">
      {visibleNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `${navLinkBase} ${
              isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <span className="text-lg">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex">
        <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-950 lg:flex">
          <div className="flex items-center gap-2 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white">
              PP
            </div>
            <div>
              <p className="text-sm font-semibold">PropertyParse</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Parsing operations center</p>
            </div>
          </div>
          <div className="mt-8">{renderNavLinks()}</div>
        </aside>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        ) : null}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-200 bg-white px-4 py-6 transition-transform dark:border-slate-800 dark:bg-slate-950 lg:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white">
                PP
              </div>
              <div>
                <p className="text-sm font-semibold">PropertyParse</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Parsing operations center</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="mt-6">{renderNavLinks()}</div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className={`mx-auto flex w-full ${widthClass} flex-wrap items-center justify-between gap-4 px-6 py-4`}>
              <div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200 lg:hidden"
                >
                  Menu
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {actions}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {theme === 'dark' ? 'Light mode' : 'Night mode'}
                </button>
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
                      PP
                    </span>
                    <span className="hidden text-xs font-semibold sm:inline">Account</span>
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
                    </svg>
                  </summary>
                  <div className="absolute right-0 mt-2 w-40 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg dark:border-slate-800 dark:bg-slate-950">
                    <NavLink
                      to="/account/security"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Account security
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="w-full rounded-md px-3 py-2 text-left font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Logout
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </header>
          <main className={`w-full px-6 py-8 ${contentFullWidth ? '' : `mx-auto ${widthClass}`}`}>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {subtitle ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
              ) : null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
  const widthClass = density === 'wide' ? 'max-w-[1600px]' : 'max-w-[1440px]';
