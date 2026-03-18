import { describe, expect, it } from 'vitest';
import type { RowResult } from '../types/parse';
import {
  buildLocalCsvForExport,
  computeParseSummaryFromRowResults,
  getDisplaySafeMatchedAddress,
  getManualApprovalBlocker,
  getResolverDetails,
  getReviewDebugHint,
  getReviewExplanation,
  getReviewReasonBucket,
  isHeaderOnlyCsv,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSafeManualApprovalCandidate,
  isSkippedRow,
  isValidRow,
  shouldShowOneCandidateBadge,
} from './parseUtils';

const buildRow = (overrides: Partial<RowResult>): RowResult => ({
  source_row_index: 1,
  source_row_id: 'row-1',
  status: 'VALID',
  ...overrides,
});

describe('parseUtils filters', () => {
  it('flags needs review rows by status or reason', () => {
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'unmatched_other' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ reason_code: 'needs_review' }))).toBe(true);

    expect(isNeedsReviewRow(buildRow({ status: 'NEEDS_REVIEW' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'REVIEW_REQUIRED' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('flags skipped rows by status prefix or skipped reason code', () => {
    expect(isSkippedRow(buildRow({ status: 'SKIPPED' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'SKIPPED_NO_ADDRESS_FOUND' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'NON_ADDRESS_TEXT' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'VALID', reason_code: 'PO_BOX' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('keeps skipped non-address rows out of needs review', () => {
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'NON_ADDRESS_TEXT' }))).toBe(false);
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'PO_BOX' }))).toBe(false);
  });

  it('flags matched rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'MATCHED' }))).toBe(true);
  });

  it('treats VALID_OVERRIDE rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'VALID_OVERRIDE' }))).toBe(true);
  });

  it('treats duplicate rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'DUPLICATE' }))).toBe(true);
    expect(isValidRow(buildRow({ status: 'UNMATCHED', is_duplicate: true }))).toBe(true);
  });

  it('computes duplicate counts from row results', () => {
    const rows: RowResult[] = [
      buildRow({ source_row_id: 'row-1', status: 'VALID', canonical_id: 'canon-1', formatted_address: '123 Main St' }),
      buildRow({ source_row_id: 'row-2', status: 'DUPLICATE', canonical_id: 'canon-1', is_duplicate: true, duplicate_of_source_row_id: 'row-1' }),
      buildRow({ source_row_id: 'row-3', status: 'UNMATCHED_NEEDS_REVIEW' }),
    ];

    const summary = computeParseSummaryFromRowResults(rows);

    expect(summary.rows_received).toBe(3);
    expect(summary.valid_total).toBe(2);
    expect(summary.valid_unique).toBe(1);
    expect(summary.duplicates).toBeGreaterThan(0);
    expect(summary.needs_review).toBe(1);
    expect(summary.attention_total).toBe(1);
  });

  it('prefers google display fields over matched_address for display-safe matched address text', () => {
    const row = buildRow({
      matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
      matched_address_display: '4785 Hwy 5, Douglasville, GA 30135',
      google_formatted_address: '4785 Highway 5, Douglasville, GA 30135',
      google_display_address: '4785 Highway 5, Douglasville, GA 30135',
      formatted_address: 'fallback',
    });

    expect(getDisplaySafeMatchedAddress(row)).toBe('4785 Highway 5, Douglasville, GA 30135');
  });

  it('flags out of scope rows by status or reason', () => {
    expect(isOutOfScopeRow(buildRow({ status: 'SKIPPED_OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ reason_code: 'OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('treats out-of-scope marker rows as out of scope', () => {
    expect(isOutOfScopeRow(buildRow({ status: 'OUT_OF_SCOPE_MARKER' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ reason_code: 'OUT_OF_SCOPE_MARKER' }))).toBe(true);
  });

  it('maps review reason buckets and debug hints', () => {
    expect(getReviewReasonBucket(buildRow({ reason_code: 'ROUTE_ALIAS' }))).toBe('route_alias');
    expect(getReviewReasonBucket(buildRow({ reason_code: 'HOUSE_NUMBER_MISMATCH' }))).toBe('house_number');
    expect(getReviewReasonBucket(buildRow({ reason_code: 'LOW_PRECISION' }))).toBe('low_precision');
    expect(getReviewDebugHint(buildRow({ blocked_by: 'directional conflict' }))).toBe('Blocked by directional conflict');
    expect(getReviewDebugHint(buildRow({ verification_precision: 'county' }))).toBe('Candidate is county-level only');
  });

  it('prefers resolver metadata for explanations and approval gating while preserving legacy fallbacks', () => {
    const resolverRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      resolver_strategy: 'typo_unique',
      decision_tier: 'typo',
      candidate_count_in_scope: 1,
      matched_address: '12 Main St',
      compare_debug: 'edit distance win',
    });
    const ambiguousRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      candidate_count_in_scope: 2,
      ambiguity_reason: 'Two similar street names remain',
      matched_address: '12 Main St',
      competing_place_ids: ['p1', 'p2'],
    });
    const legacyRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      reason_code: 'LOW_PRECISION',
      verification_precision: 'county',
    });

    expect(getReviewExplanation(resolverRow)).toBe('Unique in-scope typo correction');
    expect(isSafeManualApprovalCandidate(resolverRow)).toBe(true);
    expect(getReviewExplanation(ambiguousRow)).toBe('Still ambiguous: 2 in-scope candidates');
    expect(getManualApprovalBlocker(ambiguousRow)).toBe('Still ambiguous: 2 in-scope candidates');
    expect(getReviewExplanation(legacyRow)).toBe('Candidate was only verified at broad area precision');
    expect(getReviewDebugHint(legacyRow)).toBe('Candidate is county-level only');
  });

  it('shows subtle badge and resolver details for single-candidate reviews that still need confirmation', () => {
    const row = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      candidate_count_in_scope: 1,
      resolver_strategy: 'route_only_fallback',
      verification_precision: 'route',
      ambiguity_reason: 'Second-pass rescue failed',
      compare_debug: { candidate: 'route' },
      blocked_by: ['missing street number'],
    });

    expect(shouldShowOneCandidateBadge(row)).toBe(true);
    expect(isSafeManualApprovalCandidate(row)).toBe(false);
    expect(getResolverDetails(row)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Resolver', value: 'route_only_fallback' }),
        expect.objectContaining({ label: 'In-scope candidates', value: '1' }),
        expect.objectContaining({ label: 'Blocked by', value: 'missing street number' }),
      ]),
    );
  });

  it('builds local csv exports and detects header-only csv', async () => {
    const blob = buildLocalCsvForExport('needs_review', {
      rowResults: [buildRow({ source_row_id: 'r1', status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'LOW_PRECISION' })],
      canonicalAddresses: [],
    });
    expect(blob).toBeDefined();
    expect(isHeaderOnlyCsv('a,b\n')).toBe(true);
    expect(isHeaderOnlyCsv('a,b\n1,2')).toBe(false);
  });
});
