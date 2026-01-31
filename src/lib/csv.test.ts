import { describe, expect, it } from 'vitest';
import { buildCsvString } from './csv';

describe('buildCsvString', () => {
  it('includes required processing report headers', () => {
    const rows = [
      {
        source_row_index: 1,
        source_row_id: 'row-1',
        status: 'VALID',
        reason_code: '',
        reason_detail: '',
        detected_address: '123 Main St',
        formatted_address: '123 Main St, City, ST',
        place_id: 'place-1',
        canonical_id: 'canon-1',
        is_duplicate: false,
        raw_row_json: '{"foo":"bar"}',
      },
    ];
    const csv = buildCsvString(rows, {
      columns: [
        'source_row_index',
        'source_row_id',
        'status',
        'reason_code',
        'reason_detail',
        'detected_address',
        'formatted_address',
        'place_id',
        'canonical_id',
        'is_duplicate',
        'raw_row_json',
      ],
    });
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe(
      'source_row_index,source_row_id,status,reason_code,reason_detail,detected_address,formatted_address,place_id,canonical_id,is_duplicate,raw_row_json',
    );
  });
});
