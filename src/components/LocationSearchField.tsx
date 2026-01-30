import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';

type LocationSearchFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  onSearch: (query: string, signal?: AbortSignal) => Promise<string[]>;
  helperText?: string;
};

const DEBOUNCE_DELAY_MS = 250;
const OPTION_ROW_HEIGHT = 32;
const MAX_VISIBLE_OPTIONS = 6;

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
  const debounceTimeout = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipDebounceQueryRef = useRef<string | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const runSearch = useCallback(
    async (nextQuery: string) => {
      if (disabled) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await onSearch(nextQuery, controller.signal);
        if (controller.signal.aborted) return;
        setOptions(result);
      } catch {
        if (controller.signal.aborted) return;
        setOptions([]);
        setErrorMessage('Unable to load results (API error)');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [disabled, onSearch],
  );

  useEffect(() => {
    if (!isOpen || disabled) {
      return;
    }

    if (skipDebounceQueryRef.current === query) {
      skipDebounceQueryRef.current = null;
      return;
    }

    if (debounceTimeout.current) {
      window.clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = window.setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceTimeout.current) {
        window.clearTimeout(debounceTimeout.current);
      }
    };
  }, [query, isOpen, disabled, runSearch]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const showClear = value.length > 0;
  const loadingLabel = query ? 'Searching...' : 'Loading...';
  const showEmptyState = !loading && !errorMessage && options.length === 0;
  const emptyMessage = query ? 'No matches found' : 'No results available';
  const shouldVirtualize = options.length > 200;
  const listHeight = useMemo(() => {
    if (options.length === 0) return OPTION_ROW_HEIGHT;
    return Math.min(options.length, MAX_VISIBLE_OPTIONS) * OPTION_ROW_HEIGHT;
  }, [options.length]);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    skipDebounceQueryRef.current = query;
    runSearch(query);
  }, [disabled, query, runSearch]);

  const handleSelect = useCallback(
    (option: string) => {
      if (blurTimeout.current) {
        window.clearTimeout(blurTimeout.current);
      }
      onChange(option);
      setQuery(option);
      setIsOpen(false);
    },
    [onChange],
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
          onFocus={() => {
            handleOpen();
          }}
          onClick={() => {
            if (!isOpen) {
              handleOpen();
            }
          }}
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
              <div className="px-3 py-2 text-sm text-slate-500">{loadingLabel}</div>
            ) : errorMessage ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-rose-500">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runSearch(query)}
                >
                  Retry
                </button>
              </div>
            ) : options.length ? (
              shouldVirtualize ? (
                <FixedSizeList
                  height={listHeight}
                  itemCount={options.length}
                  itemSize={OPTION_ROW_HEIGHT}
                  width="100%"
                >
                  {({ index, style }) => {
                    const option = options[index];
                    return (
                      <button
                        type="button"
                        style={style}
                        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelect(option)}
                      >
                        {option}
                      </button>
                    );
                  }}
                </FixedSizeList>
              ) : (
                options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    {option}
                  </button>
                ))
              )
            ) : showEmptyState ? (
              <div className="px-3 py-2 text-sm text-slate-500">{emptyMessage}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
