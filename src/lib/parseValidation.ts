export type ScopeMode = 'county_wide' | 'locality_strict';

export function hasValidLocation(state: string, county: string, scopeMode: ScopeMode, localities: string[]): boolean {
  if (!state || !county) return false;
  if (scopeMode === 'locality_strict') {
    return localities.length > 0;
  }
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
