import { useEffect, useMemo, useState } from 'react';
import type { RowResult } from '../types/parse';
import {
  isDuplicateRow,
  isErrorRow,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  isValidRow,
  matchesSearch,
  stringifyPreview,
} from '../lib/parseUtils';

export type ProcessingReportFilter =
  | 'all'
  | 'valid'
  | 'needs_review'
  | 'skipped'
  | 'duplicates'
  | 'out_of_scope'
  | 'errors';

type ProcessingReportModalProps = {
  open: boolean;
  rows: RowResult[];
  onClose: () => void;
  initialFilter?: ProcessingReportFilter;
};

const STATUS_OPTIONS: Array<{ value: ProcessingReportFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'valid', label: 'Valid' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'duplicates', label: 'Duplicates' },
  { value: 'out_of_scope', label: 'Out of Scope' },
  { value: 'errors', label: 'Errors' },
];

const getStatusClasses = (row: RowResult) => {
  if (isErrorRow(row)) return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200';
  if (isSkippedRow(row))
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  if (isNeedsReviewRow(row))
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200';
  if (isDuplicateRow(row))
    return 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-200';
  if (isOutOfScopeRow(row))
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200';
};

const filterRows = (rows: RowResult[], filter: ProcessingReportFilter) => {
  switch (filter) {
    case 'valid':
      return rows.filter(isValidRow);
    case 'needs_review':
      return rows.filter(isNeedsReviewRow);
    case 'skipped':
      return rows.filter(isSkippedRow);
    case 'duplicates':
      return rows.filter(isDuplicateRow);
    case 'out_of_scope':
      return rows.filter(isOutOfScopeRow);
    case 'errors':
      return rows.filter(isErrorRow);
    default:
      return rows;
  }
};

const copyRowJson = (row: RowResult) => {
  const payload = JSON.stringify(row, null, 2);
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(payload);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = payload;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

export default function ProcessingReportModal({
  open,
  rows,
  onClose,
  initialFilter = 'all',
}: ProcessingReportModalProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProcessingReportFilter>(initialFilter);

  useEffect(() => {
    if (!open) return;
    setFilter(initialFilter);
    setQuery('');
  }, [initialFilter, open]);

  const filteredRows = useMemo(() => {
    const statusFiltered = filterRows(rows, filter);
    return statusFiltered.filter((row) => matchesSearch(row, query));
  }, [rows, filter, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 dark:bg-slate-950/70">
      <div className="flex w-full max-w-6xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Processing Report
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inspect every row and its final disposition.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search addresses, reasons, raw values..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ProcessingReportFilter)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filteredRows.length} of {rows.length}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Row #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Detected Address</th>
                  <th className="px-4 py-3">Canonical Address</th>
                  <th className="px-4 py-3">Reason Code</th>
                  <th className="px-4 py-3">Reason Detail</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                      colSpan={7}
                    >
                      No rows match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {row.source_row_index}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(
                            row,
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {row.detected_address || '--'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {row.formatted_address || '--'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {row.reason_code || '--'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {stringifyPreview(row.reason_detail ?? '--', 120)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => copyRowJson(row)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Copy JSON
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Tip: search scans detected + formatted addresses, reasons, status, IDs, and raw row JSON.
        </div>
      </div>
    </div>
  );
}
