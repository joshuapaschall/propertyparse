import statesJson from '../assets/states_json.json';

// states_json.json shape is: { "GA": "Georgia", "AL": "Alabama", ... }

const CODE_TO_NAME = statesJson as Record<string, string>;

// Build a sorted list of FULL names (deduped)
export const STATE_NAMES: string[] = Array.from(
  new Set(Object.values(CODE_TO_NAME).map((s) => (s || '').trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));

// Return full state name given either a full name or a 2-letter code.
export function toFullState(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';

  // If code provided, map directly
  if (/^[A-Z]{2}$/.test(raw) && CODE_TO_NAME[raw]) return CODE_TO_NAME[raw];

  // If full name provided (any casing), find canonical casing from STATE_NAMES
  const lower = raw.toLowerCase();
  const match = STATE_NAMES.find((n) => n.toLowerCase() === lower);
  return match || raw;
}
