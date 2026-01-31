import { useEffect, useState } from 'react';
import { getHealth, validateApiKeys } from '../lib/api';

type StatusState = 'idle' | 'ok' | 'error';

const statusStyles: Record<StatusState, string> = {
  idle: 'bg-slate-300',
  ok: 'bg-emerald-500',
  error: 'bg-rose-500',
};

function StatusPill({ label, state }: { label: string; state: StatusState }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <span className={`h-2 w-2 rounded-full ${statusStyles[state]}`} />
      {label}
    </div>
  );
}

export default function StatusIndicators() {
  const [health, setHealth] = useState<StatusState>('idle');
  const [apiKeys, setApiKeys] = useState<StatusState>('idle');
  const [checking, setChecking] = useState(false);

  const runChecks = async () => {
    setChecking(true);
    try {
      await getHealth();
      setHealth('ok');
    } catch {
      setHealth('error');
    }
    try {
      await validateApiKeys();
      setApiKeys('ok');
    } catch {
      setApiKeys('error');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runChecks();
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</div>
      <StatusPill label="API Health" state={health} />
      <StatusPill label="API Keys" state={apiKeys} />
      <button
        type="button"
        onClick={runChecks}
        className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
        disabled={checking}
      >
        {checking ? 'Checking...' : 'Refresh'}
      </button>
    </div>
  );
}
