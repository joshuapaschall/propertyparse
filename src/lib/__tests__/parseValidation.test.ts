import { describe, it, expect } from 'vitest';
import { canStartParse, hasValidLocation } from '../parseValidation';

describe('hasValidLocation', () => {
  it('returns false when state is missing', () => {
    expect(hasValidLocation('', ['Fulton'], 'county_wide', [])).toBe(false);
  });

  it('returns true when state and one county are set (county_wide)', () => {
    expect(hasValidLocation('Georgia', ['Fulton'], 'county_wide', [])).toBe(true);
  });

  it('returns true when state and multiple counties are set (county_wide)', () => {
    expect(hasValidLocation('Georgia', ['Fulton', 'DeKalb', 'Cobb'], 'county_wide', [])).toBe(true);
  });

  it('returns false when county_wide has no counties even with localities', () => {
    expect(hasValidLocation('Georgia', [], 'county_wide', ['Atlanta'])).toBe(false);
  });

  it('returns true when locality_strict has localities and no counties', () => {
    expect(hasValidLocation('Georgia', [], 'locality_strict', ['Atlanta'])).toBe(true);
  });

  it('returns true when locality_strict has both counties and localities', () => {
    expect(hasValidLocation('Georgia', ['Fulton', 'DeKalb', 'Cobb'], 'locality_strict', ['Atlanta'])).toBe(true);
  });

  it('returns false when locality_strict has no localities', () => {
    expect(hasValidLocation('Georgia', ['Fulton'], 'locality_strict', [])).toBe(false);
  });

  it('returns false when nothing is set besides state', () => {
    expect(hasValidLocation('Georgia', [], 'county_wide', [])).toBe(false);
  });
});

describe('canStartParse', () => {
  it('returns true when state, counties, and file are present (county_wide)', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', ['Fulton'], 'county_wide', [])).toBe(true);
  });

  it('returns true with multiple counties', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', ['Fulton', 'DeKalb'], 'county_wide', [])).toBe(true);
  });

  it('returns true when locality_strict has localities and no counties', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', [], 'locality_strict', ['Atlanta'])).toBe(true);
  });

  it('returns false when no file', () => {
    expect(canStartParse(null, 'Georgia', ['Fulton'], 'county_wide', [])).toBe(false);
  });

  it('returns false when county_wide has no counties even with localities', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, 'Georgia', [], 'county_wide', ['Atlanta'])).toBe(false);
  });

  it('returns false when state is missing', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
    expect(canStartParse(file, '', [], 'locality_strict', ['Atlanta'])).toBe(false);
  });
});
