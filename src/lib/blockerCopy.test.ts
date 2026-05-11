import { describe, expect, it } from 'vitest';
import { blockerLabel, blockerSentence, humanizeBlocker } from './blockerCopy';

describe('blockerCopy', () => {
  it('maps known backend codes to label and sentence', () => {
    expect(humanizeBlocker('missing_county_from_result')).toEqual({
      label: 'County not confirmed',
      sentence: "We couldn't confirm a county for this address. Edit the address or override to valid if you're sure.",
    });
    expect(humanizeBlocker('route_mismatch').label).toBe('Street name conflict');
    expect(humanizeBlocker('house_number_mismatch').label).toBe('House number conflict');
    expect(humanizeBlocker('out_of_scope').label).toBe('Outside scope');
    expect(humanizeBlocker('low_precision_match').label).toBe('Approximate match');
  });

  it('falls back for unknown snake_case code', () => {
    expect(humanizeBlocker('future_backend_code')).toEqual({
      label: "Can't auto-approve",
      sentence: 'This row needs a manual check before it can be approved.',
    });
  });

  it('passes through human sentence strings unchanged', () => {
    expect(blockerLabel('Multiple in-scope candidates remain')).toBe('Multiple in-scope candidates remain');
    expect(blockerSentence('Multiple in-scope candidates remain')).toBe('Multiple in-scope candidates remain');
  });

  it('uses fallback for nullish or empty inputs', () => {
    expect(blockerLabel(null)).toBe("Can't auto-approve");
    expect(blockerLabel(undefined)).toBe("Can't auto-approve");
    expect(blockerLabel('   ')).toBe("Can't auto-approve");
  });

  it('normalizes whitespace and hyphen variants', () => {
    expect(blockerLabel('  out-of-scope-county  ')).toBe('Outside scope');
    expect(blockerSentence('missing county from result')).toBe(
      "We couldn't confirm a county for this address. Edit the address or override to valid if you're sure.",
    );
  });
});
