export function hasValidLocation(state: string, county: string, city: string): boolean {
  return Boolean(state && (county || city));
}

export function canStartParse(
  file: File | null,
  state: string,
  county: string,
  city: string,
): boolean {
  return Boolean(file && hasValidLocation(state, county, city));
}
