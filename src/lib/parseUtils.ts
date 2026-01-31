import type { RowResult } from '../types/parse';

const normalizeValue = (value?: string) => (value ?? '').toUpperCase();

export const isNeedsReviewRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  const reason = normalizeValue(row.reason_code);
  return status.includes('UNMATCHED') || reason.includes('NEEDS_REVIEW');
};

export const isSkippedRow = (row: RowResult) => normalizeValue(row.status).startsWith('SKIPPED');

export const isOutOfScopeRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  const reason = normalizeValue(row.reason_code);
  return status.includes('OUT_OF_SCOPE') || reason.includes('OUT_OF_SCOPE');
};

export const isDuplicateRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  return status === 'DUPLICATE' || row.is_duplicate === true;
};

export const isErrorRow = (row: RowResult) => normalizeValue(row.status).startsWith('ERROR');

export const isValidRow = (row: RowResult) => normalizeValue(row.status) === 'VALID';

export const buildReasonLabel = (row: RowResult) => {
  const reason = row.reason_code ?? '';
  const detail = row.reason_detail ?? '';
  if (reason && detail) return `${reason} — ${detail}`;
  return reason || detail || '--';
};

export const stringifyPreview = (value: unknown, maxLength = 180) => {
  if (value === null || value === undefined) return '--';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
};

export const matchesSearch = (row: RowResult, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    row.detected_address,
    row.formatted_address,
    row.reason_code,
    row.reason_detail,
    row.status,
    row.source_row_id,
    row.canonical_id,
    row.place_id,
    row.raw_row ? JSON.stringify(row.raw_row) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
};
