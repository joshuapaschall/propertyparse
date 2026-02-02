import type { RowResult } from '../types/parse';

const normalizeValue = (value?: string) => (value ?? '').toUpperCase();

type ReasonMetadata = {
  label: string;
  description: string;
  fix_hint: string;
};

const REASON_METADATA: Record<string, ReasonMetadata> = {
  STREET_NUMBER_NOT_VERIFIED: {
    label: "Street number couldn't be verified",
    description: 'We found a street match but could not confidently verify the street number.',
    fix_hint: 'Confirm the street number and include unit, building, or suffix details.',
  },
  HOUSE_NUMBER_NOT_VERIFIED: {
    label: "Street number couldn't be verified",
    description: 'We found a street match but could not confidently verify the street number.',
    fix_hint: 'Confirm the street number and include unit, building, or suffix details.',
  },
  LOW_PRECISION_MATCH: {
    label: 'Only a ZIP/route-level match was found',
    description: 'We could only match the address at a broad ZIP or route level.',
    fix_hint: 'Provide the full street address for a precise match.',
  },
  LOW_PRECISION: {
    label: 'Only a ZIP/route-level match was found',
    description: 'We could only match the address at a broad ZIP or route level.',
    fix_hint: 'Provide the full street address for a precise match.',
  },
  OUT_OF_SCOPE: {
    label: 'Out of scope for selected location',
    description: 'The detected address falls outside the selected location context.',
    fix_hint: 'Adjust the selected location or run a new job for this area.',
  },
  PO_BOX: {
    label: 'P.O. Box (skipped)',
    description: 'P.O. Boxes are skipped because they are not physical property addresses.',
    fix_hint: 'Replace with a physical street address.',
  },
  ADDRESS_NOT_FOUND: {
    label: "Address couldn't be found",
    description: "We couldn't verify this as a deliverable street address.",
    fix_hint: 'Confirm the address and include street, city, and state.',
  },
  INVALID_ADDRESS: {
    label: "Address couldn't be found",
    description: "We couldn't verify this as a deliverable street address.",
    fix_hint: 'Confirm the address and include street, city, and state.',
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
