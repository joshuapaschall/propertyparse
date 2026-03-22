import { describe, expect, it } from 'vitest';
import { canStartParse } from '../parseValidation';

describe('parseValidation', () => {
  it('returns true when county-wide scope has state, county, and file', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', 'Fulton', 'county_wide', [])).toBe(true);
  });

  it('returns true when locality-strict scope has at least one locality', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', 'Fulton', 'locality_strict', ['Atlanta'])).toBe(true);
  });

  it('returns false when locality-strict scope has no localities', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', 'Fulton', 'locality_strict', [])).toBe(false);
  });

  it('returns false when county is missing', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', '', 'county_wide', [])).toBe(false);
  });

  it('returns false when no file is provided', () => {
    expect(canStartParse(null, 'Georgia', 'Fulton', 'county_wide', [])).toBe(false);
  });
});
