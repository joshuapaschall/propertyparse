export type CsvRow = Record<string, unknown>;

type CsvOptions = {
  columns?: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  return Object.prototype.toString.call(value) === '[object Object]';
};

const safeStringify = (value: unknown) => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
};

const flattenRow = (row: CsvRow, prefix = ''): CsvRow => {
  return Object.entries(row).reduce<CsvRow>((acc, [key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      Object.assign(acc, flattenRow(value, nextKey));
      return acc;
    }
    if (Array.isArray(value)) {
      acc[nextKey] = safeStringify(value);
      return acc;
    }
    acc[nextKey] = value;
    return acc;
  }, {});
};

const stringifyCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return safeStringify(value);
};

const escapeCsv = (value: string) => {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const buildCsvString = (rows: CsvRow[], options: CsvOptions = {}) => {
  if (rows.length === 0) {
    const headers = options.columns ?? [];
    return headers.length ? `${headers.join(',')}\n` : '';
  }
  const flattenedRows = rows.map((row) => flattenRow(row));
  const headers =
    options.columns ??
    Array.from(
      flattenedRows.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set()),
    );

  const lines = [headers.join(',')];
  flattenedRows.forEach((row) => {
    const line = headers
      .map((header) => escapeCsv(stringifyCell(row[header])))
      .join(',');
    lines.push(line);
  });
  return `${lines.join('\n')}\n`;
};

export const downloadCsv = (filename: string, rows: CsvRow[], options: CsvOptions = {}) => {
  const csv = buildCsvString(rows, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
