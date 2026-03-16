import { describe, expect, it } from 'vitest';
import { normalizeJobSummary, normalizeUpdatedJobPayload } from './jobSummary';

describe('normalizeJobSummary', () => {
  it('prefers needs_review over unmatched', () => {
    const summary = normalizeJobSummary({ needs_review: 3, unmatched: 9 });
    expect(summary.needsReview).toBe(3);
  });

  it('computes attentionTotal if missing', () => {
    const summary = normalizeJobSummary({ needs_review: 4, out_of_scope: 2, skipped: 1 });
    expect(summary.attentionTotal).toBe(7);
  });

  it('uses attention_total when present', () => {
    const summary = normalizeJobSummary({ needs_review: 4, out_of_scope: 2, skipped: 1, attention_total: 99 });
    expect(summary.attentionTotal).toBe(99);
  });

  it('normalizes updated_job payload in both flat and nested shapes', () => {
    const flat = normalizeUpdatedJobPayload({ rows_received: 10, needs_review: 2 });
    expect(flat.parseSummary?.rows_received).toBe(10);

    const nested = normalizeUpdatedJobPayload({ job: { rows_received: 9 }, summary: { needs_review: 3 } });
    expect(nested.parseSummary?.rows_received).toBe(9);
    expect(nested.parseSummary?.needs_review).toBe(3);
  });
});
