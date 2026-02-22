import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncSelect from 'react-select/async';
import type { SingleValue } from 'react-select';

type Option = { value: string; label: string };

type AsyncLocationSelectProps = {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  cacheScope?: string;
  loadOptions: (inputValue: string) => Promise<string[]>;
  onChange: (value: string) => void;
  onClear: () => void;
};

export default function AsyncLocationSelect({
  label,
  value,
  placeholder,
  disabled,
  required,
  helperText,
  cacheScope = 'default',
  loadOptions,
  onChange,
  onClear,
}: AsyncLocationSelectProps) {
  const [defaultOptions, setDefaultOptions] = useState<Option[]>([]);
  const cacheRef = useRef<Map<string, Option[]>>(new Map());
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    cacheRef.current.clear();
    setDefaultOptions([]);
  }, [cacheScope]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const toOptions = useCallback((values: string[]) => {
    const seen = new Set<string>();
    return values
      .map((entry) => entry.trim())
      .filter((entry) => {
        if (!entry) return false;
        const key = entry.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((entry) => ({ value: entry, label: entry }));
  }, []);

  const fetchOptions = useCallback(
    (inputValue: string) => {
      const query = inputValue.trim();
      const cacheKey = `${cacheScope}|${query.toLowerCase()}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }

      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }

      return new Promise<Option[]>((resolve) => {
        debounceRef.current = window.setTimeout(async () => {
          try {
            const result = await loadOptions(query);
            const options = toOptions(result);
            cacheRef.current.set(cacheKey, options);
            if (!query) {
              setDefaultOptions(options);
            }
            resolve(options);
          } catch {
            resolve([]);
          }
        }, 250);
      });
    },
    [cacheScope, loadOptions, toOptions],
  );

  const selectedOption = useMemo(() => {
    if (!value) return null;
    return { value, label: value };
  }, [value]);

  return (
    <div className="relative space-y-2">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AsyncSelect<Option, false>
            unstyled
            isSearchable
            cacheOptions
            defaultOptions={defaultOptions.length ? defaultOptions : true}
            value={selectedOption}
            isDisabled={disabled}
            placeholder={placeholder}
            maxMenuHeight={300}
            loadOptions={fetchOptions}
            onChange={(option: SingleValue<Option>) => onChange(option?.value ?? '')}
            classNames={{
              control: (state) =>
                [
                  'flex min-h-[42px] w-full items-center rounded-lg border px-3 py-2 text-sm shadow-sm transition',
                  state.isFocused
                    ? 'border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-300 dark:ring-indigo-900/40'
                    : 'border-slate-200 dark:border-slate-700',
                  disabled
                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200',
                ].join(' '),
              valueContainer: () => 'p-0',
              singleValue: () => 'text-sm text-slate-700 dark:text-slate-200',
              placeholder: () => 'text-sm text-slate-400 dark:text-slate-500',
              indicatorsContainer: () => 'text-slate-400 dark:text-slate-500',
              menu: () =>
                'mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900',
              menuList: () => 'max-h-72 overflow-auto py-2',
              option: (state) =>
                [
                  'cursor-pointer rounded-md px-3 py-2 text-sm',
                  state.isSelected
                    ? 'bg-indigo-600 text-white'
                    : state.isFocused
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-700 dark:text-slate-200',
                ].join(' '),
            }}
          />
        </div>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear
          </button>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p> : null}
    </div>
  );
}
