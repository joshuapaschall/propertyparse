import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncSelect from 'react-select/async';
import AsyncCreatableSelect from 'react-select/async-creatable';
import type { GroupBase, SingleValue } from 'react-select';

type Option = { value: string; label: string; kind?: 'official' | 'recent-custom'; __isNew__?: boolean };
type OptionGroup = GroupBase<Option>;

type AsyncLocationSelectProps = {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  cacheScope?: string;
  allowCustomValue?: boolean;
  formatCreateLabel?: (inputValue: string) => string;
  noOptionsMessage?: (inputValue: string) => string;
  loadOptions: (inputValue: string, signal?: AbortSignal) => Promise<string[]>;
  onChange: (value: string) => void;
  onClear: () => void;
};

const RECENT_CUSTOM_LOCALITIES_KEY = 'pp-recent-custom-localities';

export const normalizeLocalityInput = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const readRecentCustomValues = (cacheScope: string) => {
  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOM_LOCALITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(parsed?.[cacheScope]) ? parsed[cacheScope] : [];
  } catch {
    return [];
  }
};

export const writeRecentCustomValue = (cacheScope: string, value: string) => {
  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOM_LOCALITIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const existing = Array.isArray(parsed[cacheScope]) ? parsed[cacheScope] : [];
    parsed[cacheScope] = [value, ...existing.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8);
    window.localStorage.setItem(RECENT_CUSTOM_LOCALITIES_KEY, JSON.stringify(parsed));
  } catch {
    // no-op
  }
};

export default function AsyncLocationSelect({
  label,
  value,
  placeholder,
  disabled,
  required,
  helperText,
  cacheScope = 'default',
  allowCustomValue = false,
  formatCreateLabel,
  noOptionsMessage,
  loadOptions,
  onChange,
  onClear,
}: AsyncLocationSelectProps) {
  const [defaultOptions, setDefaultOptions] = useState<OptionGroup[]>([]);
  const [recentCustomOptions, setRecentCustomOptions] = useState<Option[]>([]);
  const cacheRef = useRef<Map<string, OptionGroup[]>>(new Map());
  const debounceRef = useRef<number | null>(null);
  const debounceResolverRef = useRef<((options: OptionGroup[]) => void) | null>(null);
  const debounceAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    cacheRef.current.clear();
    setDefaultOptions([]);
    setRecentCustomOptions(
      allowCustomValue
        ? readRecentCustomValues(cacheScope).map((entry) => ({
            value: entry,
            label: entry,
            kind: 'recent-custom',
          }))
        : [],
    );
  }, [cacheScope]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      if (debounceResolverRef.current) {
        debounceResolverRef.current([]);
        debounceResolverRef.current = null;
      }
      if (debounceAbortRef.current) {
        debounceAbortRef.current.abort();
        debounceAbortRef.current = null;
      }
    };
  }, []);

  const toOptions = useCallback((values: string[], kind: Option['kind'] = 'official') => {
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
      .map((entry): Option => ({ value: entry, label: entry, kind }));
  }, []);

  const toGroupedOptions = useCallback(
    (values: string[], query: string) => {
      const officialOptions = toOptions(values, 'official');
      const loweredQuery = query.trim().toLowerCase();
      const filteredRecent = allowCustomValue
        ? recentCustomOptions.filter((option) =>
            loweredQuery ? option.value.toLowerCase().includes(loweredQuery) : true,
          )
        : [];
      const officialLower = new Set(officialOptions.map((option) => option.value.toLowerCase()));
      const dedupedRecent = filteredRecent.filter((option) => !officialLower.has(option.value.toLowerCase()));
      const groups: OptionGroup[] = [];
      if (dedupedRecent.length) {
        groups.push({ label: 'Recent custom localities', options: dedupedRecent });
      }
      groups.push({
        label: allowCustomValue ? 'Official localities' : 'Available options',
        options: officialOptions,
      });
      return groups;
    },
    [allowCustomValue, recentCustomOptions, toOptions],
  );

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
        debounceRef.current = null;
      }
      if (debounceAbortRef.current) {
        debounceAbortRef.current.abort();
        debounceAbortRef.current = null;
      }
      if (debounceResolverRef.current) {
        debounceResolverRef.current([]);
        debounceResolverRef.current = null;
      }

      return new Promise<OptionGroup[]>((resolve) => {
        debounceResolverRef.current = resolve;
        const controller = new AbortController();
        debounceAbortRef.current = controller;
        debounceRef.current = window.setTimeout(async () => {
          try {
            const result = await loadOptions(query, controller.signal);
            const options = toGroupedOptions(result, query);
            cacheRef.current.set(cacheKey, options);
            if (!query) {
              setDefaultOptions(options);
            }
            if (debounceResolverRef.current === resolve) {
              debounceResolverRef.current = null;
              debounceAbortRef.current = null;
              debounceRef.current = null;
              resolve(options);
            }
          } catch {
            if (debounceResolverRef.current === resolve) {
              debounceResolverRef.current = null;
              debounceAbortRef.current = null;
              debounceRef.current = null;
              resolve([]);
            }
          }
        }, 250);
      });
    },
    [cacheScope, loadOptions, toGroupedOptions],
  );

  useEffect(() => {
    void fetchOptions('');
  }, [fetchOptions]);

  const selectedOption = useMemo(() => {
    if (!value) return null;
    const normalizedValue = allowCustomValue ? normalizeLocalityInput(value) : value;
    const isRecent = recentCustomOptions.some((option) => option.value.toLowerCase() === normalizedValue.toLowerCase());
    return {
      value: normalizedValue,
      label: normalizedValue,
      kind: isRecent ? 'recent-custom' : 'official',
    } as Option;
  }, [allowCustomValue, recentCustomOptions, value]);

  const commonProps = {
    unstyled: true,
    isSearchable: true,
    cacheOptions: true,
    defaultOptions: defaultOptions.length ? defaultOptions : true,
    value: selectedOption,
    isDisabled: disabled,
    placeholder,
    maxMenuHeight: 300,
    loadOptions: fetchOptions,
    onChange: (option: SingleValue<Option>) => onChange(option?.value ?? ''),
    noOptionsMessage: ({ inputValue }: { inputValue: string }) =>
      noOptionsMessage?.(inputValue) ??
      (allowCustomValue && inputValue.trim()
        ? 'No official matches yet. You can use a custom locality.'
        : 'No options available for this scope yet.'),
    formatGroupLabel: (group: OptionGroup) => (
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {group.label}
      </div>
    ),
    classNames: {
      control: (state: { isFocused: boolean }) =>
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
      option: (state: { isSelected: boolean; isFocused: boolean; data: Option }) =>
        [
          'cursor-pointer rounded-md px-3 py-2 text-sm',
          state.data.kind === 'recent-custom' ? 'border border-dashed border-amber-200 dark:border-amber-500/30' : '',
          state.isSelected
            ? 'bg-indigo-600 text-white'
            : state.isFocused
              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-700 dark:text-slate-200',
        ].join(' '),
    },
  } as const;

  return (
    <div className="relative space-y-2">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {allowCustomValue ? (
            <AsyncCreatableSelect<Option, false>
              key={cacheScope}
              {...commonProps}
              formatCreateLabel={(inputValue) =>
                formatCreateLabel?.(normalizeLocalityInput(inputValue)) ??
                `Use custom locality "${normalizeLocalityInput(inputValue)}"`
              }
              onCreateOption={(inputValue) => {
                const normalized = normalizeLocalityInput(inputValue);
                if (!normalized) return;
                writeRecentCustomValue(cacheScope, normalized);
                setRecentCustomOptions((prev) => [
                  { value: normalized, label: normalized, kind: 'recent-custom' as const },
                  ...prev.filter((item) => item.value.toLowerCase() !== normalized.toLowerCase()),
                ].slice(0, 8));
                onChange(normalized);
              }}
            />
          ) : (
            <AsyncSelect<Option, false> key={cacheScope} {...commonProps} />
          )}
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
