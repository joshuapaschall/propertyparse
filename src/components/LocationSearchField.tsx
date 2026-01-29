import { useEffect, useMemo, useRef, useState } from 'react';

type LocationSearchFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  onSearch: (query: string) => Promise<string[]>;
  helperText?: string;
};

export default function LocationSearchField({
  label,
  value,
  placeholder,
  disabled,
  required,
  onChange,
  onSearch,
  helperText,
}: LocationSearchFieldProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const blurTimeout = useRef<number | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen || disabled) {
      return;
    }
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await onSearch(query);
        setOptions(result);
      } catch {
        setOptions([]);
        setErrorMessage('Unable to load locations. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [query, isOpen, disabled, onSearch]);

  const showClear = value.length > 0;
  const filteredOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  return (
    <div className="relative space-y-2">
      <label className="text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full text-sm outline-none disabled:bg-transparent disabled:text-slate-400"
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!isOpen) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            blurTimeout.current = window.setTimeout(() => setIsOpen(false), 150);
          }}
        />
        {showClear ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onChange('');
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
      {isOpen ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="max-h-48 overflow-auto p-2">
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-500">Searching...</div>
            ) : errorMessage ? (
              <div className="px-3 py-2 text-sm text-rose-500">{errorMessage}</div>
            ) : filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (blurTimeout.current) {
                      window.clearTimeout(blurTimeout.current);
                    }
                    onChange(option);
                    setQuery(option);
                    setIsOpen(false);
                  }}
                >
                  {option}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">No matches found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
