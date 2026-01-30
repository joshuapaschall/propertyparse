import { useMemo } from 'react';
import Select, { SingleValue } from 'react-select';

type LocationSelectProps = {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  onChange: (value: string) => void;
  onClear: () => void;
};

type Option = { value: string; label: string };

export default function LocationSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  required,
  helperText,
  onChange,
  onClear,
}: LocationSelectProps) {
  const selectOptions = useMemo<Option[]>(
    () => options.map((option) => ({ value: option, label: option })),
    [options],
  );

  const selectedOption = useMemo(() => {
    if (!value) return null;
    return selectOptions.find((option) => option.value === value) ?? {
      value,
      label: value,
    };
  }, [selectOptions, value]);

  return (
    <div className="relative space-y-2">
      <label className="text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select<Option, false>
            unstyled
            isSearchable={false}
            options={selectOptions}
            value={selectedOption}
            isDisabled={disabled}
            placeholder={placeholder}
            maxMenuHeight={300}
            onChange={(option: SingleValue<Option>) => onChange(option?.value ?? '')}
            classNames={{
              control: (state) =>
                [
                  'flex min-h-[42px] w-full items-center rounded-lg border px-3 py-2 text-sm shadow-sm transition',
                  state.isFocused
                    ? 'border-indigo-400 ring-2 ring-indigo-100'
                    : 'border-slate-200',
                  disabled ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-700',
                ].join(' '),
              valueContainer: () => 'p-0',
              singleValue: () => 'text-sm text-slate-700',
              placeholder: () => 'text-sm text-slate-400',
              indicatorsContainer: () => 'text-slate-400',
              menu: () => 'mt-1 rounded-lg border border-slate-200 bg-white shadow-lg',
              menuList: () => 'max-h-72 overflow-auto py-2',
              option: (state) =>
                [
                  'cursor-pointer rounded-md px-3 py-2 text-sm',
                  state.isSelected
                    ? 'bg-indigo-600 text-white'
                    : state.isFocused
                      ? 'bg-slate-100 text-slate-700'
                      : 'text-slate-700',
                ].join(' '),
            }}
          />
        </div>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}
