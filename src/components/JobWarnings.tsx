import { useState } from 'react';

type WarningInput = string | { code?: string; message?: string; detail?: unknown; [key: string]: unknown };

type JobWarningsProps = {
  warnings: WarningInput[];
  className?: string;
};

const getWarningView = (warning: WarningInput) => {
  if (typeof warning === 'string') {
    return { title: warning, details: null as string | null };
  }

  const code = typeof warning.code === 'string' ? warning.code : '';
  if (code === 'SUPABASE_SCHEMA_NOT_MIGRATED') {
    return {
      title: 'Database schema is behind. Run the latest Supabase migration and refresh the app.',
      details: JSON.stringify(warning, null, 2),
    };
  }

  const title = (typeof warning.message === 'string' && warning.message.trim()) || (code ? `Warning: ${code}` : 'Warning');
  return {
    title,
    details: JSON.stringify(warning, null, 2),
  };
};

export default function JobWarnings({ warnings, className }: JobWarningsProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!warnings.length) return null;

  return (
    <div className={className ?? 'mt-4 space-y-2'}>
      {warnings.map((warning, index) => {
        const view = getWarningView(warning);
        return (
          <div key={index} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-medium">{view.title}</p>
            {view.details ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [index]: !prev[index] }))}
                  className="text-xs font-semibold underline"
                >
                  {expanded[index] ? 'Hide technical details' : 'Show technical details'}
                </button>
                {expanded[index] ? <pre className="mt-1 overflow-auto text-[11px]">{view.details}</pre> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
