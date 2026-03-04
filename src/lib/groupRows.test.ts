import { describe, expect, it } from 'vitest';
import type { RowResult } from '../types/parse';
import { groupRows } from './groupRows';

const buildRow = (overrides: Partial<RowResult> & { normalized_input?: string }): RowResult => ({
  source_row_index: 1,
  source_row_id: crypto.randomUUID(),
  status: 'UNMATCHED_NEEDS_REVIEW',
  ...overrides,
});

describe('groupRows', () => {
  it('groups by normalized_input first', () => {
    const rows = [
      buildRow({ source_row_id: '1', normalized_input: '123 main st' }),
      buildRow({ source_row_id: '2', normalized_input: '123 MAIN ST ' }),
      buildRow({ source_row_id: '3', normalized_input: '99 broadway' }),
    ];

    const result = groupRows(rows);

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(2);
    expect(result[0].memberRowIds).toEqual(['1', '2']);
  });

  it('falls back to detected_address and matched_address', () => {
    const rows = [
      buildRow({ source_row_id: 'a', detected_address: '555 Oak Rd, Dallas TX' }),
      buildRow({ source_row_id: 'b', detected_address: '555 oak rd dallas tx' }),
      buildRow({ source_row_id: 'c', matched_address: '888 Pine St, Miami FL' }),
      buildRow({ source_row_id: 'd', matched_address: '888 pine st miami fl' }),
    ];

    const result = groupRows(rows);

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(2);
    expect(result[1].count).toBe(2);
  });
});
