export type ScopeMode = 'county_wide' | 'locality_strict';

/**
 * A parse scope is valid when:
 *  - state is set, AND
 *  - at least one of (county, ≥1 locality) is set, AND
 *  - if scope_mode is locality_strict, ≥1 locality is set.
 *
 * Mirrors backend _validate_location in app/main.py:3480.
 */
export function hasValidLocation(
  state: string,
  county: string,
  scopeMode: ScopeMode,
  localities: string[],
): boolean {
  if (!state) return false;
  const hasLocality = localities.length > 0;
  if (!county && !hasLocality) return false;
  if (scopeMode === 'county_wide' && !county) return false;
  if (scopeMode === 'locality_strict' && !hasLocality) return false;
  return true;
}

export function canStartParse(
  file: File | null,
  state: string,
  county: string,
  scopeMode: ScopeMode,
  localities: string[],
): boolean {
  return Boolean(file && hasValidLocation(state, county, scopeMode, localities));
}
