import { describe, expect, it } from 'vitest';
import { normalizeJobSummary } from './jobSummary';

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
});
