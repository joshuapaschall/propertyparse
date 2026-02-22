import { useRef } from 'react';

type ExportMenuOption = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type ExportMenuProps = {
  options: ExportMenuOption[];
  buttonLabel?: string;
  disabled?: boolean;
};

export default function ExportMenu({ options, buttonLabel = 'Export', disabled = false }: ExportMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  return (
    <details ref={detailsRef} className="relative inline-block text-left">
      <summary
        className={`list-none rounded-lg border px-3 py-2 text-xs font-semibold transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
            : 'cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
      >
        {buttonLabel}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              option.onSelect();
              detailsRef.current?.removeAttribute('open');
            }}
            disabled={disabled || option.disabled || option.loading}
            className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 last:border-b-0 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-500"
          >
            {option.loading ? 'Downloading…' : option.label}
          </button>
        ))}
      </div>
    </details>
  );
}
