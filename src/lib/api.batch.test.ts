import { describe, it, expect } from 'vitest';

describe('batch API types', () => {
  it('getBatches is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatches).toBe('function');
  });

  it('getBatchRollup is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatchRollup).toBe('function');
  });

  it('getBatchJobs is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatchJobs).toBe('function');
  });

  it('BatchRollup allows optional progress', async () => {
    const api = await import('./api');
    const fixture: api.BatchRollup = {
      batch: {} as api.BatchResponse,
      job_counts: { total: 1, pending: 0, running: 1, succeeded: 0, failed: 0 },
      row_totals: { total_rows: 10, matched_count: 5, unmatched_count: 5 },
      effective_status: 'RUNNING',
      progress: {
        phase: 'VERIFYING',
        done: 3,
        total: 10,
        percent: 30,
        eta_seconds: 120,
        cache_hits: 1,
        google_calls_used: 2,
        jobs_total: 3,
        jobs_running: 1,
        jobs_completed: 1,
      },
    };
    expect(fixture.progress?.done).toBe(3);
  });
});
