import { describe, it, expect } from 'vitest';
import { groupJobsByBatch } from './batchGrouping';

const makeRow = (overrides: Partial<Parameters<typeof groupJobsByBatch>[0][number]> = {}) => ({
  id: 'job-1',
  batchId: null,
  status: 'DONE',
  createdAt: '2026-05-12T10:00:00Z',
  name: 'Test job',
  rowsReceived: 10,
  validUnique: 8,
  needsReview: 1,
  outOfScope: 0,
  skipped: 1,
  duplicates: 0,
  ...overrides,
});

describe('groupJobsByBatch', () => {
  it('standalone jobs pass through unchanged', () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
    const result = groupJobsByBatch(rows);
    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.type === 'standalone')).toBe(true);
  });

  it('groups jobs with same batchId into a batch-header', () => {
    const rows = [
      makeRow({ id: 'a', batchId: 'batch-1', rowsReceived: 10, validUnique: 8 }),
      makeRow({ id: 'b', batchId: 'batch-1', rowsReceived: 20, validUnique: 15 }),
    ];
    const result = groupJobsByBatch(rows);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('batch-header');
    if (result[0].type === 'batch-header') {
      expect(result[0].rows).toHaveLength(2);
      expect(result[0].totalRows).toBe(30);
      expect(result[0].totalValid).toBe(23);
    }
  });

  it('mixed standalone and batch jobs maintain order', () => {
    const rows = [
      makeRow({ id: 'a', batchId: null }),
      makeRow({ id: 'b', batchId: 'batch-1' }),
      makeRow({ id: 'c', batchId: 'batch-1' }),
      makeRow({ id: 'd', batchId: null }),
    ];
    const result = groupJobsByBatch(rows);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('standalone');
    expect(result[1].type).toBe('batch-header');
    expect(result[2].type).toBe('standalone');
  });

  it('batch status is RUNNING if any job is RUNNING', () => {
    const rows = [
      makeRow({ id: 'a', batchId: 'b1', status: 'DONE' }),
      makeRow({ id: 'b', batchId: 'b1', status: 'RUNNING' }),
    ];
    const result = groupJobsByBatch(rows);
    expect(result[0].type === 'batch-header' && result[0].status).toBe('RUNNING');
  });

  it('batch status is FAILED if any job FAILED and none RUNNING', () => {
    const rows = [
      makeRow({ id: 'a', batchId: 'b1', status: 'DONE' }),
      makeRow({ id: 'b', batchId: 'b1', status: 'FAILED' }),
    ];
    const result = groupJobsByBatch(rows);
    expect(result[0].type === 'batch-header' && result[0].status).toBe('FAILED');
  });
});
