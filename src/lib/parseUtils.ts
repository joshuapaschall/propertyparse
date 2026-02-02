import type { RowResult } from '../types/parse';

const normalizeValue = (value?: string) => (value ?? '').toUpperCase();

type ReasonMetadata = {
  label: string;
  description: string;
  fix_hint: string;
};

const REASON_METADATA: Record<string, ReasonMetadata> = {
  HOUSE_NUMBER_NOT_VERIFIED: {
    label: "Street number couldn't be verified",
    description: 'We found a street match but could not confidently verify the house number.',
    fix_hint: 'Confirm the street number and include any unit or suffix.',
  },
  LOW_PRECISION: {
    label: 'Match too broad (needs more detail)',
    description: 'We could only match the address at a high level (city or ZIP).',
    fix_hint: 'Add the street number and full street name.',
  },
  OUT_OF_SCOPE: {
    label: 'Out of scope for selected location',
    description: 'The detected address falls outside the selected location filters.',
    fix_hint: 'Adjust the selected location or remove the row from this job.',
  },
  PO_BOX: {
    label: 'PO Boxes are skipped',
    description: 'PO Boxes are not supported for validation.',
    fix_hint: 'Replace with a physical street address.',
  },
  INVALID_ADDRESS: {
    label: 'Address could not be verified',
    description: 'We could not match the address to a verified location.',
    fix_hint: 'Check spelling and include full street + city + state.',
  },
  MISSING_ADDRESS: {
    label: 'Missing address data',
    description: 'We could not find a usable address in this row.',
    fix_hint: 'Ensure the address column is populated.',
  },
};

const humanizeReasonCode = (code: string) => {
  if (!code) return '';
  const spaced = code.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const getReasonMetadata = (row: RowResult) => {
  const normalized = normalizeValue(row.reason_code);
  const detail = row.reason_detail?.trim() ?? '';
  let metadata = normalized ? REASON_METADATA[normalized] : undefined;
  if (!metadata && normalized.startsWith('OUT_OF_SCOPE')) {
    metadata = REASON_METADATA.OUT_OF_SCOPE;
  }
  const label =
    metadata?.label || detail || (normalized ? humanizeReasonCode(normalized) : 'Needs review');
  const description = metadata?.description || detail || 'Review the row for more context.';
  const fixHint = metadata?.fix_hint || 'Update the address and retry if needed.';
  return {
    label,
    description,
    fix_hint: fixHint,
  };
};

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

export const buildReasonLabel = (row: RowResult) => getReasonMetadata(row).label;

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
