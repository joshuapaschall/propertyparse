import type { ScopeMode } from './parseValidation';

// County names from the backend may or may not include the " County" suffix.
// Strip it so display code can append it consistently without producing
// "Fulton County County".
export const stripCountySuffix = (value: string): string =>
  value.replace(/\s+County\s*$/i, '').trim();

export const buildScopeSummary = (
  state: string,
  counties: string[],
  scopeMode: ScopeMode,
  localities: string[],
) => {
  const localitySummary = scopeMode === 'county_wide'
    ? counties.length === 0
      ? 'No counties selected'
      : counties.length === 1
        ? `All localities in ${stripCountySuffix(counties[0])} County`
        : `All localities in ${counties.length} counties`
    : localities.length === 0
      ? 'No locality selected'
      : localities.length === 1
        ? `${localities[0]} only`
        : localities.length === 2
          ? localities.join(', ')
          : `${localities[0]} + ${localities.length - 1} more localit${localities.length - 1 === 1 ? 'y' : 'ies'}`;
  const stateSegment = state || 'State not selected';
  // Build the county segment. Omit it entirely when no counties AND localities present
  // (state + city scope doesn't need a "Counties not selected" line).
  const countySegment = counties.length === 0
    ? 'Counties not selected'
    : counties.length === 1
      ? `${stripCountySuffix(counties[0])} County`
      : counties.length === 2
        ? `${stripCountySuffix(counties[0])} + ${stripCountySuffix(counties[1])} Counties`
        : `${stripCountySuffix(counties[0])} + ${counties.length - 1} more counties`;
  const showCountySegment = counties.length > 0 || localities.length === 0;
  const segments = showCountySegment
    ? [stateSegment, countySegment, localitySummary]
    : [stateSegment, localitySummary];
  return segments.join(' • ');
};
