import type { CanonicalAddress, ParseSummary, RowResult } from '../types/parse';

const normalizeValue = (value?: string) => (value ?? '').toUpperCase();

const getHttpStatusFromError = (error: unknown) => {
  if (!error || typeof error !== 'object') return null;
  const maybeInfo = (error as { apiErrorInfo?: { status?: number } }).apiErrorInfo;
  if (typeof maybeInfo?.status === 'number') return maybeInfo.status;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isTemporaryResultsUnavailableError = (error: unknown) => {
  const status = getHttpStatusFromError(error);
  return status === 202 || status === 404 || status === 409 || status === 425 || status === 429 || status === 503;
};

export const hasHydratedResultsPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as { row_results?: unknown; canonical_addresses?: unknown; summary?: ParseSummary };
  if (!Array.isArray(record.row_results) || !Array.isArray(record.canonical_addresses)) return false;
  const rowsReceived = typeof record.summary?.rows_received === 'number' ? record.summary.rows_received : null;
  if (rowsReceived !== null && rowsReceived > 0) {
    return record.row_results.length > 0 || record.canonical_addresses.length > 0;
  }
  return true;
};

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

const asTrimmedString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const asStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asTrimmedString(item)).filter(Boolean);
};
const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getBlockedByList = (row: RowResult) => {
  if (Array.isArray(row.blocked_by)) return row.blocked_by.map((item) => item.trim()).filter(Boolean);
  if (typeof row.blocked_by === 'string' && row.blocked_by.trim()) {
    return row.blocked_by
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const stringifyUnknown = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getCompareDebugText = (row: RowResult) => stringifyUnknown(row.compare_debug);
const getCandidateCount = (row: RowResult) => asNumber(row.candidate_count_in_scope);
const getCompetingPlaceIds = (row: RowResult) => asStringArray(row.competing_place_ids);
const getConvergedPlaceIds = (row: RowResult) => asStringArray(row.converged_place_ids);
const getPrecision = (row: RowResult) => asTrimmedString(row.verification_precision).toLowerCase();
const getResolverStrategy = (row: RowResult) => asTrimmedString(row.resolver_strategy).toLowerCase();
const getDecisionTier = (row: RowResult) => asTrimmedString(row.decision_tier).toLowerCase();
const getAmbiguityReason = (row: RowResult) => asTrimmedString(row.ambiguity_reason);
const getReasonCode = (row: RowResult) => normalizeValue(row.reason_code);

const inferCompareHint = (row: RowResult) => {
  const debug = getCompareDebugText(row);
  const lowered = debug.toLowerCase();
  if (!lowered) return '';
  if (lowered.includes('same house number')) return 'Same house number · safe alias candidate';
  if (lowered.includes('suffix')) return 'Comparison favored a suffix correction';
  if (lowered.includes('typo') || lowered.includes('edit distance')) return 'Comparison favored a typo correction';
  if (lowered.includes('directional')) return 'Comparison found a directional conflict';
  return debug;
};

const hasHouseNumberConflict = (row: RowResult) => {
  const reason = getReasonCode(row);
  const ambiguity = getAmbiguityReason(row).toLowerCase();
  const debug = getCompareDebugText(row).toLowerCase();
  return (
    reason.includes('HOUSE_NUMBER') ||
    ambiguity.includes('house number conflict') ||
    ambiguity.includes('house-number conflict') ||
    debug.includes('house number conflict') ||
    debug.includes('number mismatch')
  );
};

const isLowPrecisionResolverCase = (row: RowResult) => {
  const precision = getPrecision(row);
  const strategy = getResolverStrategy(row);
  const reason = getReasonCode(row);
  return (
    ['route', 'route_only', 'county', 'county_only', 'locality', 'locality_only', 'zip', 'postal_code'].includes(precision) ||
    strategy.includes('route_only') ||
    strategy.includes('county_only') ||
    strategy.includes('locality_only') ||
    reason.includes('LOW_PRECISION')
  );
};

export const getReviewExplanation = (row: RowResult) => {
  const strategy = getResolverStrategy(row);
  const tier = getDecisionTier(row);
  const candidateCount = getCandidateCount(row);
  const ambiguity = getAmbiguityReason(row);
  const reason = getReasonCode(row);
  const compareHint = inferCompareHint(row).toLowerCase();

  if (strategy.includes('typo') || tier.includes('typo') || compareHint.includes('typo correction')) {
    return 'Unique in-scope typo correction';
  }
  if (strategy.includes('suffix') || tier.includes('suffix') || compareHint.includes('suffix correction')) {
    return 'Unique in-scope suffix correction';
  }
  if (hasHouseNumberConflict(row)) {
    return reason.includes('NOT_VERIFIED') || reason.includes('MISSING_STREET_NUMBER')
      ? 'Street number still not verified'
      : 'House number conflict';
  }
  if (candidateCount !== null && candidateCount > 1) {
    return `Still ambiguous: ${candidateCount} in-scope candidates`;
  }
  if (ambiguity) {
    return ambiguity;
  }
  if (strategy.includes('route_only')) {
    return 'Route-only candidate; second-pass rescue failed';
  }
  if (strategy.includes('county_only')) {
    return 'County-only candidate; second-pass rescue failed';
  }
  if (strategy.includes('locality_only')) {
    return 'Locality-only candidate; second-pass rescue failed';
  }
  if (reason.includes('MISSING_STREET_NUMBER') || reason.includes('STREET_NUMBER_NOT_VERIFIED') || reason.includes('HOUSE_NUMBER_NOT_VERIFIED')) {
    return 'Street number still not verified';
  }
  if (reason.includes('LOW_PRECISION')) {
    return 'Candidate was only verified at broad area precision';
  }
  if (reason.includes('ROUTE') || reason.includes('ALIAS')) {
    return candidateCount === 1 ? 'Unique in-scope route alias candidate' : 'Route alias still needs confirmation';
  }
  return row.reason_detail?.trim() || (reason ? humanizeReasonCode(reason) : 'Needs review');
};

export const getReasonMetadata = (row: RowResult) => {
  const normalized = getReasonCode(row);
  const detail = row.reason_detail?.trim() ?? '';
  let metadata = normalized ? REASON_METADATA[normalized] : undefined;
  if (!metadata && normalized.startsWith('OUT_OF_SCOPE')) {
    metadata = REASON_METADATA.OUT_OF_SCOPE;
  }

  const resolverExplanation = getReviewExplanation(row);
  const label = metadata?.label || detail || resolverExplanation || (normalized ? humanizeReasonCode(normalized) : 'Needs review');
  const description = metadata?.description || detail || resolverExplanation || 'Review the row for more context.';
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
  const reason = getReasonCode(row);
  return (
    status.includes('UNMATCHED') ||
    status.includes('NEEDS_REVIEW') ||
    status.includes('REVIEW') ||
    reason.includes('NEEDS_REVIEW')
  );
};

export const isSkippedRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  const reason = getReasonCode(row);
  return status.startsWith('SKIPPED') || SKIPPED_REASON_CODES.has(reason);
};

export const isOutOfScopeRow = (row: RowResult) => {
  const status = normalizeValue(row.status);
  const reason = getReasonCode(row);
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

export type ReviewReasonFilter = 'all' | 'route_alias' | 'house_number' | 'low_precision' | 'county_rescue' | 'missing_street_number';

export const getReviewReasonBucket = (row: RowResult) => {
  const reason = getReasonCode(row);
  const strategy = getResolverStrategy(row);
  const precision = getPrecision(row);
  if (reason.includes('ALIAS') || reason.includes('ROUTE') || strategy.includes('route')) return 'route_alias' as const;
  if (reason.includes('HOUSE_NUMBER_MISMATCH') || reason.includes('HOUSE_NUMBER') || hasHouseNumberConflict(row)) return 'house_number' as const;
  if (reason.includes('MISSING_STREET_NUMBER') || reason.includes('STREET_NUMBER_NOT_VERIFIED')) return 'missing_street_number' as const;
  if (reason.includes('COUNTY') || strategy.includes('county') || precision.includes('county')) return 'county_rescue' as const;
  if (reason.includes('LOW_PRECISION') || reason.includes('LOW_PRECISION_MATCH') || isLowPrecisionResolverCase(row)) return 'low_precision' as const;
  return 'all' as const;
};

export const getReviewDebugHint = (row: RowResult) => {
  const blocked = getBlockedByList(row);
  const precision = getPrecision(row);
  const ambiguity = getAmbiguityReason(row);
  const compareHint = inferCompareHint(row);
  const candidateCount = getCandidateCount(row);

  if (compareHint) return compareHint;
  if (blocked.some((item) => item.toLowerCase().includes('directional'))) return 'Blocked by directional conflict';
  if (blocked.some((item) => item.toLowerCase().includes('core') || item.toLowerCase().includes('token'))) return 'Blocked by core token drop';
  if (candidateCount !== null && candidateCount > 1) return `${candidateCount} in-scope candidates remain`; 
  if (precision === 'county' || precision === 'county_only') return 'Candidate is county-level only';
  if (precision === 'route' || precision === 'route_only') return 'Candidate is route-level only';
  if (precision === 'locality' || precision === 'locality_only') return 'Candidate is locality-level only';
  if (blocked.length) return `Blocked by ${blocked.join(', ')}`;
  if (ambiguity) return ambiguity;
  if (precision) return `Verification precision: ${precision}`;
  return null;
};

export const isSafeManualApprovalCandidate = (row: RowResult) => {
  const candidateCount = getCandidateCount(row);
  const precision = getPrecision(row);
  const competing = getCompetingPlaceIds(row);
  const blocked = getBlockedByList(row);
  const reason = getReasonCode(row);
  const ambiguity = getAmbiguityReason(row);
  const matchedAddress = getDisplaySafeMatchedAddress(row);

  if (!matchedAddress) return false;
  if (candidateCount !== null && candidateCount !== 1) return false;
  if (competing.length > 1) return false;
  if (blocked.length > 0) return false;
  if (hasHouseNumberConflict(row)) return false;
  if (ambiguity) return false;
  if (['route', 'route_only', 'county', 'county_only', 'locality', 'locality_only', 'zip', 'postal_code'].includes(precision)) return false;
  if (reason.includes('LOW_PRECISION') || reason.includes('MISSING_STREET_NUMBER') || reason.includes('STREET_NUMBER_NOT_VERIFIED')) return false;
  return true;
};

export const shouldShowOneCandidateBadge = (row: RowResult) => {
  return isNeedsReviewRow(row) && getCandidateCount(row) === 1 && !isSafeManualApprovalCandidate(row);
};

export const getManualApprovalBlocker = (row: RowResult) => {
  if (isSafeManualApprovalCandidate(row)) return null;
  const candidateCount = getCandidateCount(row);
  const precision = getPrecision(row);
  const ambiguity = getAmbiguityReason(row);
  const competing = getCompetingPlaceIds(row);

  if (!getDisplaySafeMatchedAddress(row)) return 'No street-level candidate was resolved';
  if (candidateCount !== null && candidateCount > 1) return `Still ambiguous: ${candidateCount} in-scope candidates`;
  if (competing.length > 1) return 'Multiple competing candidates remain';
  if (hasHouseNumberConflict(row)) return getReviewExplanation(row);
  if (ambiguity) return ambiguity;
  if (['route', 'route_only'].includes(precision)) return 'Route-only candidate cannot be approved';
  if (['county', 'county_only'].includes(precision)) return 'County-only candidate cannot be approved';
  if (['locality', 'locality_only'].includes(precision)) return 'Locality-only candidate cannot be approved';
  return getReviewExplanation(row);
};

export const getResolverDetails = (row: RowResult) => {
  const details: Array<{ label: string; value: string }> = [];
  if (asTrimmedString(row.resolver_strategy)) details.push({ label: 'Resolver', value: asTrimmedString(row.resolver_strategy) });
  if (asTrimmedString(row.decision_tier)) details.push({ label: 'Decision tier', value: asTrimmedString(row.decision_tier) });
  if (getCandidateCount(row) !== null) details.push({ label: 'In-scope candidates', value: String(getCandidateCount(row)) });
  const blocked = getBlockedByList(row);
  if (blocked.length) details.push({ label: 'Blocked by', value: blocked.join(', ') });
  if (getAmbiguityReason(row)) details.push({ label: 'Ambiguity', value: getAmbiguityReason(row) });
  const compareHint = inferCompareHint(row);
  if (compareHint) details.push({ label: 'Comparison', value: compareHint });
  const converged = getConvergedPlaceIds(row);
  if (converged.length) details.push({ label: 'Converged place IDs', value: converged.join(', ') });
  const competing = getCompetingPlaceIds(row);
  if (competing.length) details.push({ label: 'Competing place IDs', value: competing.join(', ') });
  return details;
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
    'resolver_strategy',
    'decision_tier',
    'candidate_count_in_scope',
    'ambiguity_reason',
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
    resolver_strategy: row.resolver_strategy ?? '',
    decision_tier: row.decision_tier ?? '',
    candidate_count_in_scope: row.candidate_count_in_scope ?? '',
    ambiguity_reason: row.ambiguity_reason ?? '',
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
