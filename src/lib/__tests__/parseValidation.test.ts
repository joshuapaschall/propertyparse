import { describe, expect, it } from 'vitest';
import { canStartParse } from '../parseValidation';

describe('parseValidation', () => {
  it('returns true when state, county, and file are provided', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

    expect(canStartParse(file, 'Georgia', 'Fulton', '')).toBe(true);
  });

  it('returns true when state, city, and file are provided', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

    expect(canStartParse(file, 'Georgia', '', 'Atlanta')).toBe(true);
  });

  it('returns false when only state and file are provided', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

    expect(canStartParse(file, 'Georgia', '', '')).toBe(false);
  });

  it('returns false when no file is provided', () => {
    expect(canStartParse(null, 'Georgia', 'Fulton', '')).toBe(false);
  });

  it('returns false when state is missing', () => {
    const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

    expect(canStartParse(file, '', 'Fulton', '')).toBe(false);
  });
});
