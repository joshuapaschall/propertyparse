import { describe, expect, it } from 'vitest';
import type { RowResult } from '../types/parse';
import { isNeedsReviewRow, isOutOfScopeRow, isSkippedRow } from './parseUtils';

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
    expect(isNeedsReviewRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('flags skipped rows by status prefix', () => {
    expect(isSkippedRow(buildRow({ status: 'SKIPPED' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'SKIPPED_NO_ADDRESS_FOUND' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('flags out of scope rows by status or reason', () => {
    expect(isOutOfScopeRow(buildRow({ status: 'SKIPPED_OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ reason_code: 'OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ status: 'VALID' }))).toBe(false);
  });
});
