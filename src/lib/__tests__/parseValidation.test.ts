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

  it('returns true when locality-strict scope has localities and no county', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', '', 'locality_strict', ['Atlanta'])).toBe(true);
  });

  it('returns true when locality-strict scope has multiple localities and no county', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', '', 'locality_strict', ['Atlanta', 'Decatur'])).toBe(true);
  });

  it('returns false when county-wide scope has no county even if localities exist', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', '', 'county_wide', ['Atlanta'])).toBe(false);
  });

  it('returns false when state is missing regardless of localities', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, '', '', 'locality_strict', ['Atlanta'])).toBe(false);
  });

});
