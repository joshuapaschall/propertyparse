import type { ParseSummary } from '../types/parse';

export type NormalizedJobSummary = {
  rowsReceived: number;
  validTotal: number;
  validUnique: number;
  needsReview: number;
  outOfScope: number;
  skipped: number;
  duplicates: number;
  matched: number;
  attentionTotal: number;
  googleCallsUsed: number;
  openAIOcrCallsUsed: number;
  spendUsd: number;
};

const toRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

const pick = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
};

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export const normalizeJobSummary = (input: unknown): NormalizedJobSummary => {
  const record = toRecord(input);

  const needsReviewValue = pick(record, ['needs_review', 'needsReview', 'needs_review_count']);
  const unmatchedValue = pick(record, ['unmatched', 'unmatched_count', 'unmatchedCount']);
  const needsReview =
    needsReviewValue !== undefined ? toNumber(needsReviewValue, 0) : toNumber(unmatchedValue, 0);

  const outOfScope = toNumber(pick(record, ['out_of_scope', 'outOfScope', 'out_of_scope_count']), 0);
  const skipped = toNumber(pick(record, ['skipped', 'skipped_count', 'skippedCount']), 0);

  const attentionTotalValue = pick(record, ['attention_total', 'attentionTotal']);
  const attentionTotal =
    attentionTotalValue !== undefined
      ? toNumber(attentionTotalValue, 0)
      : needsReview + outOfScope + skipped;

  return {
    rowsReceived: toNumber(pick(record, ['rows_received', 'rowsReceived', 'total_rows', 'rows', 'rowCount']), 0),
    validTotal: toNumber(pick(record, ['valid_total', 'validTotal']), 0),
    validUnique: toNumber(pick(record, ['valid_unique', 'validUnique', 'unique_valid']), 0),
    needsReview,
    outOfScope,
    skipped,
    duplicates: toNumber(pick(record, ['duplicates', 'duplicates_count', 'duplicate_count']), 0),
    matched: toNumber(pick(record, ['matched', 'matched_count', 'matchedCount']), 0),
    attentionTotal,
    googleCallsUsed: toNumber(pick(record, ['google_calls_used', 'googleCallsUsed']), 0),
    openAIOcrCallsUsed: toNumber(pick(record, ['openai_ocr_calls_used', 'openAIOcrCallsUsed']), 0),
    spendUsd: toNumber(pick(record, ['spend_usd', 'spendUsd']), 0),
  };
};

export const toParseSummary = (summary: NormalizedJobSummary): ParseSummary => ({
  rows_received: summary.rowsReceived,
  valid_total: summary.validTotal,
  valid_unique: summary.validUnique,
  needs_review: summary.needsReview,
  out_of_scope: summary.outOfScope,
  skipped: summary.skipped,
  duplicates: summary.duplicates,
  matched: summary.matched,
  attention_total: summary.attentionTotal,
  google_calls_used: summary.googleCallsUsed,
  openai_ocr_calls_used: summary.openAIOcrCallsUsed,
  spend_usd: summary.spendUsd,
});
