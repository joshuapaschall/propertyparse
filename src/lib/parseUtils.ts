import type { CanonicalAddress, ParseSummary, RowResult } from '../types/parse';

const normalizeValue = (value?: string) => (value ?? '').toUpperCase();

const SKIPPED_REASON_CODES = new Set(['PO_BOX', 'NON_ADDRESS_TEXT']);

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
  MISSING_STREET_NUMBER: {
    label: "Street number couldn't be verified",
    description: 'We found a street match but could not confidently verify the street number.',
    fix_hint: 'Confirm the street number and include unit, building, or suffix details.',
  },
  LOW_PRECISION_MATCH: {
    label: 'Match too broad (ZIP/route/county-only)',
    description: 'We could only match the address at a broad ZIP, route, or county level.',
    fix_hint: 'Provide the full street address for a precise match.',
  },
  LOW_PRECISION: {
    label: 'Match too broad (ZIP/route/county-only)',
    description: 'We could only match the address at a broad ZIP, route, or county level.',
    fix_hint: 'Provide the full street address for a precise match.',
  },
  OUT_OF_SCOPE: {
    label: 'Out of scope for selected location',
    description: 'The detected address falls outside the selected location context.',
    fix_hint: 'Adjust the selected location or run a new job for this area.',
  },
  PO_BOX: {
    label: 'PO Box (skipped)',
    description: 'P.O. Boxes are skipped because they are not physical property addresses.',
    fix_hint: 'Replace with a physical street address.',
  },
  NON_ADDRESS_TEXT: {
    label: 'Non-address text (skipped)',
    description:
      'This row appears to contain non-address text (for example, RIGHT-OF-WAY or VACANT LOT) instead of a street address.',
    fix_hint: 'Replace with a physical street address that includes a house number when available.',
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
  MISSING_COUNTY: {
    label: 'County is missing',
    description: 'We could not find a county for this row.',
    fix_hint: 'Add the county or select one before retrying.',
  },
  MISSING_CITY: {
    label: 'City is missing',
    description: 'We could not find a city for this row.',
    fix_hint: 'Add the city or select one before retrying.',
  },
  OUT_OF_SCOPE_STATE: {
    label: 'Out of scope for selected state',
    description: 'The detected state does not match the selected state.',
    fix_hint: 'Update the state filter or rerun the job for the detected state.',
  },
  OUT_OF_SCOPE_COUNTY: {
    label: 'Out of scope for selected county',
    description: 'The detected county does not match the selected county.',
    fix_hint: 'Update the county filter or rerun the job for the detected county.',
  },
  OUT_OF_SCOPE_CITY: {
    label: 'Out of scope for selected city',
    description: 'The detected city does not match the selected city.',
    fix_hint: 'Update the city filter or rerun the job for the detected city.',
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
  if (isSkippedRow(row)) return false;
  const status = normalizeValue(row.status);
  const reason = normalizeValue(row.reason_code);
  return (
    status.includes('UNMATCHED') ||
    status.includes('NEEDS_REVIEW') ||
    status.includes('REVIEW') ||
    reason.includes('NEEDS_REVIEW')
  );
};

export const isSkippedRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  const reason = normalizeValue(row.reason_code);
  return status.startsWith('SKIPPED') || SKIPPED_REASON_CODES.has(reason);
};

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

export const isValidRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  return (
    status === 'VALID' ||
    status === 'VALID_OVERRIDE' ||
    status === 'MATCHED' ||
    status === 'DUPLICATE' ||
    row.is_duplicate === true
  );
};

export const computeParseSummaryFromRowResults = (rows: RowResult[]): ParseSummary => {
  const validRows = rows.filter(isValidRow);
  const validKeys = new Set<string>();
  validRows.forEach((row) => {
    const key = (row.canonical_id ?? row.formatted_address ?? row.detected_address ?? row.source_row_id ?? '')
      .toString()
      .trim()
      .toLowerCase();
    if (key) validKeys.add(key);
  });

  const validUnique = validKeys.size;
  const duplicates = Math.max(validRows.length - validUnique, 0);
  const needsReview = rows.filter(isNeedsReviewRow).length;
  const skipped = rows.filter(isSkippedRow).length;
  const outOfScope = rows.filter(isOutOfScopeRow).length;

  return {
    rows_received: rows.length,
    valid_total: validRows.length,
    valid_unique: validUnique,
    needs_review: needsReview,
    skipped,
    duplicates,
    out_of_scope: outOfScope,
    matched: validRows.length,
    attention_total: needsReview + outOfScope + skipped,
  };
};


export const getDisplaySafeMatchedAddress = (row: RowResult) => {
  const candidates = [
    row.google_display_address,
    row.google_formatted_address,
    row.matched_address_display,
    row.matched_address,
    row.formatted_address,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

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


export type ReviewReasonFilter = 'all' | 'route_alias' | 'house_number' | 'low_precision' | 'county_rescue' | 'missing_street_number';

export const getReviewReasonBucket = (row: RowResult) => {
  const reason = normalizeValue(row.reason_code);
  if (reason.includes('ALIAS') || reason.includes('ROUTE')) return 'route_alias' as const;
  if (reason.includes('HOUSE_NUMBER_MISMATCH') || reason.includes('HOUSE_NUMBER')) return 'house_number' as const;
  if (reason.includes('MISSING_STREET_NUMBER') || reason.includes('STREET_NUMBER_NOT_VERIFIED')) return 'missing_street_number' as const;
  if (reason.includes('COUNTY')) return 'county_rescue' as const;
  if (reason.includes('LOW_PRECISION') || reason.includes('LOW_PRECISION_MATCH')) return 'low_precision' as const;
  return 'all' as const;
};

export const getReviewDebugHint = (row: RowResult) => {
  const debug = typeof row.compare_debug === 'string' ? row.compare_debug : '';
  const blocked = Array.isArray(row.blocked_by) ? row.blocked_by.join(', ') : row.blocked_by ?? '';
  const precision = typeof row.verification_precision === 'string' ? row.verification_precision : '';

  if (debug.toLowerCase().includes('same house number')) return 'Same house number · safe alias candidate';
  if (blocked.toLowerCase().includes('directional')) return 'Blocked by directional conflict';
  if (blocked.toLowerCase().includes('core') || blocked.toLowerCase().includes('token')) return 'Blocked by core token drop';
  if (precision.toLowerCase().includes('county')) return 'Candidate is county-level only';
  if (debug.trim()) return debug.trim();
  if (blocked.trim()) return `Blocked by ${blocked}`;
  if (precision.trim()) return `Verification precision: ${precision}`;
  return null;
};

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const buildCsvText = (headers: string[], rows: Array<Record<string, unknown>>) => {
  const header = headers.join(',');
  const body = rows.map((row) => headers.map((key) => csvEscape(row[key])).join(','));
  return [header, ...body].join('\n');
};

export type LocalExportType = 'processing_report' | 'unique_valid' | 'needs_review' | 'out_of_scope' | 'duplicates' | 'skipped';

export const buildLocalCsvForExport = (
  type: LocalExportType,
  data: { rowResults: RowResult[]; canonicalAddresses: CanonicalAddress[] },
) => {
  if (type === 'unique_valid') {
    const headers = ['full_address', 'street1', 'street2', 'city', 'state', 'zip', 'canonical_id', 'place_id'];
    const rows = data.canonicalAddresses.map((item) => ({
      full_address: (item as { full_address?: string }).full_address ?? item.formatted_address ?? '',
      street1: item.street1 ?? '',
      street2: item.street2 ?? '',
      city: item.city ?? '',
      state: item.state ?? '',
      zip: item.zip ?? '',
      canonical_id: item.canonical_id ?? '',
      place_id: item.place_id ?? '',
    }));
    return new Blob([buildCsvText(headers, rows)], { type: 'text/csv;charset=utf-8' });
  }

  const filtered = data.rowResults.filter((row) => {
    const status = normalizeValue(row.status);
    if (type === 'needs_review') return isNeedsReviewRow(row);
    if (type === 'out_of_scope') return isOutOfScopeRow(row);
    if (type === 'duplicates') return status === 'DUPLICATE' || row.is_duplicate;
    if (type === 'skipped') return isSkippedRow(row);
    return true;
  });

  const headers = [
    'source_row_id',
    'source_row_index',
    'status',
    'reason_code',
    'reason_detail',
    'detected_address',
    'matched_address',
    'formatted_address',
    'verification_precision',
    'blocked_by',
    'compare_debug',
  ];
  const rows = filtered.map((row) => ({
    source_row_id: row.source_row_id,
    source_row_index: row.source_row_index,
    status: row.status,
    reason_code: row.reason_code ?? '',
    reason_detail: row.reason_detail ?? '',
    detected_address: row.detected_address ?? '',
    matched_address: row.matched_address ?? row.google_display_address ?? '',
    formatted_address: row.formatted_address ?? '',
    verification_precision: row.verification_precision ?? '',
    blocked_by: Array.isArray(row.blocked_by) ? row.blocked_by.join('|') : row.blocked_by ?? '',
    compare_debug: typeof row.compare_debug === 'string' ? row.compare_debug : row.compare_debug ? JSON.stringify(row.compare_debug) : '',
  }));
  return new Blob([buildCsvText(headers, rows)], { type: 'text/csv;charset=utf-8' });
};

export const isHeaderOnlyCsv = (csvText: string) => {
  const trimmed = csvText.trim();
  if (!trimmed) return true;
  const lines = trimmed.split(/\r?\n/);
  return lines.length <= 1;
};
