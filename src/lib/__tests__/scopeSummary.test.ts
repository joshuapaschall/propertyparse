import { describe, expect, it } from 'vitest';
import { buildScopeSummary, stripCountySuffix } from '../scopeSummary';

describe('stripCountySuffix', () => {
  it('removes a trailing " County" suffix', () => {
    expect(stripCountySuffix('Fulton County')).toBe('Fulton');
  });

  it('is case-insensitive on the suffix', () => {
    expect(stripCountySuffix('Fulton county')).toBe('Fulton');
  });

  it('leaves bare county names untouched', () => {
    expect(stripCountySuffix('Fulton')).toBe('Fulton');
  });

  it('handles trailing whitespace', () => {
    expect(stripCountySuffix('Fulton County  ')).toBe('Fulton');
  });
});

describe('buildScopeSummary', () => {
  it('renders single county without doubling the County suffix', () => {
    expect(buildScopeSummary('Georgia', ['Fulton County'], 'county_wide', [])).toContain('Fulton County');
    expect(buildScopeSummary('Georgia', ['Fulton County'], 'county_wide', [])).not.toContain('Fulton County County');
  });

  it('renders bare county names with appended suffix', () => {
    expect(buildScopeSummary('Georgia', ['Fulton'], 'county_wide', [])).toContain('Fulton County');
    expect(buildScopeSummary('Georgia', ['Fulton'], 'county_wide', [])).not.toContain('Fulton County County');
  });

  it('renders two counties without doubling the County suffix', () => {
    const summary = buildScopeSummary('Georgia', ['Fulton County', 'DeKalb County'], 'county_wide', []);
    expect(summary).toContain('Fulton + DeKalb Counties');
    expect(summary).not.toContain('County County');
  });

  it('renders 3+ counties with the count summary', () => {
    const summary = buildScopeSummary('Georgia', ['Fulton', 'DeKalb', 'Cobb'], 'county_wide', []);
    expect(summary).toContain('Fulton + 2 more counties');
    expect(summary).toContain('All localities in 3 counties');
  });

  it('falls back to "Counties not selected" when scope is empty', () => {
    expect(buildScopeSummary('', [], 'county_wide', [])).toBe(
      'State not selected • Counties not selected • No counties selected',
    );
  });

  it('omits the county segment when only localities are set', () => {
    const summary = buildScopeSummary('Georgia', [], 'locality_strict', ['Atlanta', 'Decatur']);
    expect(summary).toBe('Georgia • Atlanta, Decatur');
  });
});
