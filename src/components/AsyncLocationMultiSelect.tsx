import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncCreatableSelect from 'react-select/async-creatable';
import type { GroupBase, MultiValue } from 'react-select';
import { normalizeLocalityInput, readRecentCustomValues, writeRecentCustomValue } from './AsyncLocationSelect';

type Option = { value: string; label: string; kind?: 'official' | 'recent-custom' | 'custom'; __isNew__?: boolean };
type OptionGroup = GroupBase<Option>;

type AsyncLocationMultiSelectProps = {
  label: string;
  values: string[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  cacheScope?: string;
  noOptionsMessage?: (inputValue: string) => string;
  formatCreateLabel?: (inputValue: string) => string;
  loadOptions: (inputValue: string) => Promise<string[]>;
  onChange: (values: string[]) => void;
};

const dedupe = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function AsyncLocationMultiSelect({
  label,
  values,
  placeholder,
  disabled,
  required,
  helperText,
  cacheScope = 'default',
  noOptionsMessage,
  formatCreateLabel,
  loadOptions,
  onChange,
}: AsyncLocationMultiSelectProps) {
  const [defaultOptions, setDefaultOptions] = useState<OptionGroup[]>([]);
  const [recentCustomOptions, setRecentCustomOptions] = useState<Option[]>([]);
  const cacheRef = useRef<Map<string, OptionGroup[]>>(new Map());
  const debounceRef = useRef<number | null>(null);

  const toOptions = useCallback((entries: string[], kind: Option['kind']) => dedupe(entries.map(normalizeLocalityInput).filter(Boolean)).map((entry) => ({ value: entry, label: entry, kind })), []);

  useEffect(() => {
    cacheRef.current.clear();
    setDefaultOptions([]);
    setRecentCustomOptions(toOptions(readRecentCustomValues(cacheScope), 'recent-custom'));
  }, [cacheScope, toOptions]);

  useEffect(() => () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
  }, []);

  const toGroupedOptions = useCallback((officialValues: string[], query: string) => {
    const officialOptions = toOptions(officialValues, 'official');
    const officialLower = new Set(officialOptions.map((option) => option.value.toLowerCase()));
    const selectedLower = new Set(values.map((value) => value.toLowerCase()));
    const loweredQuery = query.trim().toLowerCase();
    const recentOptions = recentCustomOptions.filter((option) => {
      if (officialLower.has(option.value.toLowerCase()) || selectedLower.has(option.value.toLowerCase())) return false;
      return loweredQuery ? option.value.toLowerCase().includes(loweredQuery) : true;
    });
    const groups: OptionGroup[] = [];
    if (recentOptions.length) groups.push({ label: 'Recent custom localities', options: recentOptions });
    groups.push({ label: 'Official localities', options: officialOptions.filter((option) => !selectedLower.has(option.value.toLowerCase())) });
    return groups.filter((group) => group.options.length > 0);
  }, [recentCustomOptions, toOptions, values]);

  const fetchOptions = useCallback((inputValue: string) => {
    const query = inputValue.trim();
    const cacheKey = `${cacheScope}|${query.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    return new Promise<OptionGroup[]>((resolve) => {
      debounceRef.current = window.setTimeout(async () => {
        try {
          const result = await loadOptions(query);
          const grouped = toGroupedOptions(result, query);
          cacheRef.current.set(cacheKey, grouped);
          if (!query) setDefaultOptions(grouped);
          resolve(grouped);
        } catch {
          resolve([]);
        }
      }, 250);
    });
  }, [cacheScope, loadOptions, toGroupedOptions]);

  useEffect(() => {
    void fetchOptions('');
  }, [fetchOptions]);

  const selectedOptions = useMemo(() => values.map((value) => {
    const normalized = normalizeLocalityInput(value);
    const isRecent = recentCustomOptions.some((option) => option.value.toLowerCase() === normalized.toLowerCase());
    return { value: normalized, label: normalized, kind: isRecent ? 'recent-custom' : 'custom' as const };
  }), [recentCustomOptions, values]);

  const updateValues = useCallback((next: string[]) => {
    onChange(dedupe(next.map(normalizeLocalityInput).filter(Boolean)));
  }, [onChange]);

  return (
    <div className="relative space-y-2">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <AsyncCreatableSelect<Option, true, OptionGroup>
        key={cacheScope}
        isMulti
        unstyled
        isSearchable
        cacheOptions
        defaultOptions={defaultOptions.length ? defaultOptions : true}
        value={selectedOptions}
        isDisabled={disabled}
        placeholder={placeholder}
        maxMenuHeight={300}
        loadOptions={fetchOptions}
        onChange={(options: MultiValue<Option>) => updateValues(options.map((option) => option.value))}
        onCreateOption={(inputValue) => {
          const normalized = normalizeLocalityInput(inputValue);
          if (!normalized) return;
          writeRecentCustomValue(cacheScope, normalized);
          setRecentCustomOptions((prev) => toOptions([normalized, ...prev.map((option) => option.value)], 'recent-custom'));
          updateValues([...values, normalized]);
        }}
        noOptionsMessage={({ inputValue }) =>
          noOptionsMessage?.(inputValue) ?? (inputValue.trim() ? 'No official matches yet. You can create a custom locality.' : 'No localities available for this county yet.')
        }
        formatCreateLabel={(inputValue) => formatCreateLabel?.(normalizeLocalityInput(inputValue)) ?? `Use custom locality "${normalizeLocalityInput(inputValue)}"`}
        formatGroupLabel={(group) => (
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{group.label}</div>
        )}
        classNames={{
          control: (state) => ['flex min-h-[42px] w-full items-start rounded-lg border px-3 py-2 text-sm shadow-sm transition', state.isFocused ? 'border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-300 dark:ring-indigo-900/40' : 'border-slate-200 dark:border-slate-700', disabled ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'].join(' '),
          valueContainer: () => 'flex flex-wrap gap-2 p-0',
          multiValue: (state) => ['flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium', state.data.kind === 'recent-custom' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200' : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'].join(' '),
          multiValueLabel: () => 'px-0',
          multiValueRemove: () => 'cursor-pointer rounded-full px-1 text-slate-500 hover:bg-black/5 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
          input: () => 'm-0 p-0 text-sm',
          placeholder: () => 'text-sm text-slate-400 dark:text-slate-500',
          indicatorsContainer: () => 'text-slate-400 dark:text-slate-500',
          menu: () => 'mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900',
          menuList: () => 'max-h-72 overflow-auto py-2',
          option: (state) => ['cursor-pointer rounded-md px-3 py-2 text-sm', state.data.kind === 'recent-custom' ? 'border border-dashed border-amber-200 dark:border-amber-500/30' : '', state.isSelected ? 'bg-indigo-600 text-white' : state.isFocused ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200'].join(' '),
        }}
      />
      {helperText ? <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p> : null}
    </div>
  );
}
