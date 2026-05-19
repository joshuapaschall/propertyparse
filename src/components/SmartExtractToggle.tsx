import { useState } from 'react';

type SmartExtractToggleProps = {
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export default function SmartExtractToggle({
  enabled,
  onChange,
  disabled = false,
}: SmartExtractToggleProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Smart Extract</p>
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="What is Smart Extract?"
            aria-expanded={showInfo}
          >
            i
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          AI preprocessing for tricky files (auto-applied where needed). CSVs and clean spreadsheets are skipped automatically.
        </p>
        {showInfo ? (
          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
            <p className="font-medium">When to use it:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Scanned PDFs (violation letters, code enforcement scans)</li>
              <li>PDFs with multiple columns or address types mixed together</li>
              <li>Documents with both mailing AND property addresses</li>
              <li>Anything that gave you bad results before</li>
            </ul>
            <p className="mt-2">
              Cost: roughly $0.05–$0.50 per tricky file. CSVs and clean spreadsheets are free.
            </p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition ${
          enabled
            ? 'border-indigo-600 bg-indigo-600'
            : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
        } disabled:cursor-not-allowed disabled:opacity-50`}
        role="switch"
        aria-checked={enabled}
        aria-label="Smart Extract"
        data-testid="smart-extract-toggle"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition dark:bg-slate-100 ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
