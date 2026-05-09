import { useEffect, useState } from 'react';
import { getApiErrorInfo, getHealth, validateApiKeys } from '../lib/api';

type StatusState = 'idle' | 'ok' | 'warning' | 'error';

type StatusInfo = {
  state: StatusState;
  /**
   * Human-readable detail surfaced via the StatusPill's `title` attribute
   * (native browser tooltip on hover, screen-reader announced). null when
   * the state has no actionable detail (idle / clean ok).
   */
  detail: string | null;
};

const initialStatus: StatusInfo = { state: 'idle', detail: null };

const statusStyles: Record<StatusState, string> = {
  idle: 'bg-slate-300',
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
};

function StatusPill({ label, status }: { label: string; status: StatusInfo }) {
  const tooltipText = status.detail ?? label;
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      title={tooltipText}
      tabIndex={status.detail ? 0 : -1}
      data-state={status.state}
      data-testid={`status-pill-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className={`h-2 w-2 rounded-full ${statusStyles[status.state]}`} />
      {label}
    </div>
  );
}

function formatErrorDetail(error: unknown): string {
  const info = getApiErrorInfo(error);
  if (!info) return 'Failed to reach API';
  if (info.status) {
    return `${info.status}: ${info.message}`;
  }
  return info.message || 'Failed to reach API';
}

export default function StatusIndicators() {
  const [health, setHealth] = useState<StatusInfo>(initialStatus);
  const [apiKeys, setApiKeys] = useState<StatusInfo>(initialStatus);
  const [checking, setChecking] = useState(false);

  const runChecks = async () => {
    setChecking(true);
    try {
      await getHealth();
      setHealth({ state: 'ok', detail: null });
    } catch (err) {
      setHealth({ state: 'error', detail: formatErrorDetail(err) });
    }
    try {
      const response = await validateApiKeys();
      if (response.cache_warning) {
        setApiKeys({
          state: 'warning',
          detail: `${response.cache_warning.code}: ${response.cache_warning.message}`,
        });
      } else {
        setApiKeys({ state: 'ok', detail: null });
      }
    } catch (err) {
      setApiKeys({ state: 'error', detail: formatErrorDetail(err) });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void runChecks();
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</div>
      <StatusPill label="API Health" status={health} />
      <StatusPill label="API Keys" status={apiKeys} />
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
