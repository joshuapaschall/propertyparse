import { describe, expect, it } from 'vitest';
import { deriveDisplayedParseSummary, normalizeJobSummary, normalizeUpdatedJobPayload } from './jobSummary';
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

  it('preserves pricing/admin metadata from nested usage blocks', () => {
    const summary = normalizeJobSummary({
      rows_received: 9,
      job_geocoding_calls: 4,
      month_to_date_geocoding_calls: 42,
      billing_snapshot_missing: true,
      internal_admin_usage: { geocoding_calls: 12, input_tokens: 30, output_tokens: 10 },
      customer_safe_usage: { estimated_job_cost_usd: 4.5, credits_used: 2 },
      reconciliation: { reconciliation_status: 'settled', remaining_free_cap: { geocoding: 88 } },
    });

    expect(summary.estimated_job_cost_usd).toBe(4.5);
    expect(summary.geocoding_calls).toBe(12);
    expect(summary.job_geocoding_calls).toBe(4);
    expect(summary.month_to_date_geocoding_calls).toBe(42);
    expect(summary.ai_token_usage).toBe(40);
    expect(summary.credits_used).toBe(2);
    expect(summary.reconciliation_status).toBe('settled');
    expect(summary.billing_snapshot_missing).toBe(true);
    expect(summary.remaining_free_cap_geocoding).toBe(88);
  });

  it('normalizes updated_job payload in both flat and nested shapes', () => {
    const flat = normalizeUpdatedJobPayload({ rows_received: 10, needs_review: 2 });
    expect(flat.parseSummary?.rows_received).toBe(10);

    const nested = normalizeUpdatedJobPayload({
      job: { rows_received: 9, internal_admin_usage: { geocoding_calls: 6 } },
      summary: { needs_review: 3, customer_safe_usage: { estimated_job_cost_usd: 1.1 } },
    });
    expect(nested.parseSummary?.rows_received).toBe(9);
    expect(nested.parseSummary?.needs_review).toBe(3);
    expect(nested.parseSummary?.geocoding_calls).toBe(6);
    expect(nested.parseSummary?.estimated_job_cost_usd).toBe(1.1);
  });
});

it('deriveDisplayedParseSummary prefers row-derived counts over stale zeros and keeps pricing fields', () => {
  const summary = deriveDisplayedParseSummary([
    { source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' },
    { source_row_id: 'r2', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW' },
  ] as any, {
    rows_received: 0,
    valid_total: 0,
    valid_unique: 0,
    needs_review: 0,
    skipped: 0,
    out_of_scope: 0,
    duplicates: 0,
    matched: 0,
    attention_total: 0,
    google_calls_used: 3,
    spend_usd: 1.2,
    customer_safe_usage: { estimated_job_cost_usd: 9.99 },
    reconciliation: { status: 'queued' },
  });
  expect(summary?.rows_received).toBe(2);
  expect(summary?.valid_total).toBe(1);
  expect(summary?.needs_review).toBe(1);
  expect(summary?.google_calls_used).toBe(3);
  expect(summary?.estimated_job_cost_usd).toBe(9.99);
  expect(summary?.reconciliation_status).toBe('queued');
});
