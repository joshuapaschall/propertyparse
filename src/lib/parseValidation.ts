export type ScopeMode = 'county_wide' | 'locality_strict';

/**
 * A parse scope is valid when:
 *  - state is set, AND
 *  - at least one of (≥1 county, ≥1 locality) is set, AND
 *  - if scope_mode is locality_strict, ≥1 locality is set, AND
 *  - if scope_mode is county_wide, ≥1 county is set.
 *
 * Mirrors backend _validate_location in app/main.py.
 */
export function hasValidLocation(
  state: string,
  counties: string[],
  scopeMode: ScopeMode,
  localities: string[],
): boolean {
  if (!state) return false;
  const hasCounty = counties.length > 0;
  const hasLocality = localities.length > 0;
  if (!hasCounty && !hasLocality) return false;
  if (scopeMode === 'county_wide' && !hasCounty) return false;
  if (scopeMode === 'locality_strict' && !hasLocality) return false;
  return true;
}

export function canStartParse(
  file: File | null,
  state: string,
  counties: string[],
  scopeMode: ScopeMode,
  localities: string[],
): boolean {
  return Boolean(file && hasValidLocation(state, counties, scopeMode, localities));
}
