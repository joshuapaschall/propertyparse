import { useEffect, useMemo, useState } from 'react';
import type { RowResult } from '../types/parse';
import { retryJobBatch, retryJobRow, runNeedsReviewAiFix } from '../lib/api';
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
  jobId?: string | null;
  onClose: () => void;
  initialFilter?: ProcessingReportFilter;
  onApplyUpdates: (payload: {
    updatedRows: RowResult[];
    updatedJob?: Record<string, unknown>;
  }) => void;
  forceReverify?: boolean;
  showDebugMode?: boolean;
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

const getRowDisplayId = (row: RowResult) => {
  const rawRow = row.raw_row as Record<string, unknown> | undefined;
  const recordId = rawRow?.record_id ?? rawRow?.recordId ?? rawRow?.recordID;
  if (recordId === null || recordId === undefined) {
    return `Row (data) ${row.source_row_index}`;
  }
  return typeof recordId === 'string' || typeof recordId === 'number'
    ? String(recordId)
    : `Row (data) ${row.source_row_index}`;
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
  jobId,
  onClose,
  initialFilter = 'all',
  onApplyUpdates,
  forceReverify = false,
  showDebugMode = false,
}: ProcessingReportModalProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProcessingReportFilter>(initialFilter);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [pendingEditsByRowId, setPendingEditsByRowId] = useState<Record<string, string>>({});
  const [editingRow, setEditingRow] = useState<RowResult | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [runningAiFix, setRunningAiFix] = useState(false);
  const [aiFixRowsProcessed, setAiFixRowsProcessed] = useState<number | null>(null);
  const [aiFixEstimatedCost, setAiFixEstimatedCost] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFilter(initialFilter);
    setQuery('');
  }, [initialFilter, open]);

  useEffect(() => {
    if (!editingRow) return;
    const rowId = editingRow.source_row_id;
    setEditingValue(
      pendingEditsByRowId[rowId] ??
        editingRow.detected_address ??
        editingRow.formatted_address ??
        '',
    );
  }, [editingRow, pendingEditsByRowId]);

  useEffect(() => {
    const rowIds = new Set(rows.map((row) => row.source_row_id));
    setSelectedRowIds((prev) => new Set([...prev].filter((id) => rowIds.has(id))));
    setPendingEditsByRowId((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([rowId, value]) => {
        if (rowIds.has(rowId)) {
          next[rowId] = value;
        }
      });
      return next;
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const statusFiltered = filterRows(rows, filter);
    return statusFiltered.filter((row) => matchesSearch(row, query));
  }, [rows, filter, query]);

  const selectedRowsWithEdits = useMemo(
    () =>
      Array.from(selectedRowIds)
        .map((rowId) => ({
          rowId,
          fullAddress: pendingEditsByRowId[rowId]?.trim() ?? '',
        }))
        .filter((row) => row.fullAddress.length > 0),
    [pendingEditsByRowId, selectedRowIds],
  );

  const canRetrySelected = selectedRowsWithEdits.length > 0 && !retrying && !savingRow;

  const needsReviewRowsCount = useMemo(
    () => rows.filter((row) => isNeedsReviewRow(row)).length,
    [rows],
  );

  const canRunAiFix = Boolean(jobId) && showDebugMode && needsReviewRowsCount > 0 && !runningAiFix;

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleRetrySelected = async () => {
    if (!jobId) {
      setRetryError('Missing job ID. Please re-run the parse job.');
      return;
    }
    if (!selectedRowsWithEdits.length) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await retryJobBatch(jobId, selectedRowsWithEdits, forceReverify);
      onApplyUpdates({
        updatedRows: response.updated_row_results ?? response.updated_rows ?? [],
        updatedJob: response.updated_job as Record<string, unknown> | undefined,
      });
      setPendingEditsByRowId((prev) => {
        const next = { ...prev };
        selectedRowsWithEdits.forEach((row) => {
          delete next[row.rowId];
        });
        return next;
      });
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        selectedRowsWithEdits.forEach((row) => {
          next.delete(row.rowId);
        });
        return next;
      });
    } catch (err) {
      setRetryError((err as Error).message ?? 'Retry selected failed.');
    } finally {
      setRetrying(false);
    }
  };


  const handleRunAiFix = async () => {
    if (!jobId) {
      setRetryError('Missing job ID. Please re-run the parse job.');
      return;
    }
    setRunningAiFix(true);
    setRetryError(null);
    try {
      const response = await runNeedsReviewAiFix(jobId);
      onApplyUpdates({
        updatedRows: response.updated_row_results ?? response.updated_rows ?? [],
        updatedJob: response.updated_job as Record<string, unknown> | undefined,
      });
      const processed = response.rows_processed ?? response.ai_rows_processed ?? response.attempted ?? 0;
      setAiFixRowsProcessed(processed);
      const estimatedCost = response.estimated_extra_cost_usd;
      setAiFixEstimatedCost(typeof estimatedCost === 'number' ? estimatedCost : null);
    } catch (err) {
      setRetryError((err as Error).message ?? 'AI Fix failed.');
    } finally {
      setRunningAiFix(false);
    }
  };

  const handleEditRetry = async () => {
    if (!editingRow) return;
    const rowId = editingRow.source_row_id;
    const trimmedAddress = editingValue.trim();
    if (!trimmedAddress) {
      setRetryError('Full address is required.');
      return;
    }
    setPendingEditsByRowId((prev) => ({ ...prev, [rowId]: trimmedAddress }));
    setSelectedRowIds((prev) => new Set(prev).add(rowId));
    if (!jobId) {
      setRetryError('Missing job ID. Please re-run the parse job.');
      return;
    }
    setSavingRow(true);
    setRetryError(null);
    try {
      const response = await retryJobRow(jobId, rowId, trimmedAddress, forceReverify);
      onApplyUpdates({
        updatedRows: response.updated_row_results ?? response.updated_rows ?? [],
        updatedJob: response.updated_job as Record<string, unknown> | undefined,
      });
      setPendingEditsByRowId((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
      setEditingRow(null);
    } catch (err) {
      setRetryError((err as Error).message ?? 'Retry failed.');
    } finally {
      setSavingRow(false);
    }
  };

  if (!open) return null;

  return (
    <>
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
            <button
              type="button"
              onClick={handleRetrySelected}
              disabled={!canRetrySelected}
              className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
            >
              {retrying ? 'Retrying...' : 'Retry Selected'}
            </button>
            {showDebugMode ? (
              <button
                type="button"
                onClick={handleRunAiFix}
                disabled={!canRunAiFix}
                className="rounded-lg border border-fuchsia-200 px-3 py-2 text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:border-slate-200 disabled:text-slate-400 dark:border-fuchsia-500/40 dark:text-fuchsia-200 dark:hover:bg-fuchsia-500/10 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
              >
                {runningAiFix ? 'Running AI Fix...' : 'AI Fix Needs Review'}
              </button>
            ) : null}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredRows.length} of {rows.length}
            </span>
            {showDebugMode ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Rows processed: {aiFixRowsProcessed ?? 0} · Estimated extra cost:{' '}
                {typeof aiFixEstimatedCost === 'number' ? `$${aiFixEstimatedCost.toFixed(4)}` : '$0.0000'}
              </span>
            ) : null}
          </div>

          {retryError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
              {retryError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Select</th>
                    <th className="px-4 py-3">Record ID / Row (data)</th>
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
                        colSpan={8}
                      >
                        No rows match this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const needsReview = isNeedsReviewRow(row);
                      return (
                        <tr
                          key={row.source_row_id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <td className="px-4 py-3">
                            {needsReview ? (
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(row.source_row_id)}
                                onChange={() => toggleRowSelection(row.source_row_id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                              />
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                            {getRowDisplayId(row)}
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
                            <div className="flex flex-wrap justify-end gap-2">
                              {needsReview ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRetryError(null);
                                    setEditingRow(row);
                                  }}
                                  className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10"
                                >
                                  Edit + Retry
                                </button>
                              ) : null}
                              {showDebugMode ? (
                                <button
                                  type="button"
                                  onClick={() => copyRowJson(row)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  Copy JSON
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
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

      {editingRow ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4 py-8 dark:bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950 dark:shadow-slate-950/50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Edit full address
              </h3>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Full address
              </label>
              <input
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This edit will be saved and retried for verification.
              </p>
              {retryError ? (
                <p className="text-xs text-rose-600 dark:text-rose-300">{retryError}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditRetry}
                disabled={savingRow}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300"
              >
                {savingRow ? 'Retrying...' : 'Save + Retry'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
