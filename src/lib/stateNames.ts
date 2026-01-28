import statesJson from '../assets/states_json.json';

// states_json.json shape: { "Alabama": "AL", "Alaska": "AK", ... }

// Return full state name given either a full name or a 2-letter code.
export function toFullState(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';
  // If it's already a full name, pass through.
  if ((statesJson as Record<string, string>)[s]) return s;
  // If it's a code, find the matching full name.
  if (/^[A-Z]{2}$/.test(s)) {
    const entry = Object.entries(statesJson as Record<string, string>).find(([, code]) => code === s);
    return entry ? entry[0] : s;
  }
  return s; // unknown string; pass through
}

// For convenience, provide the map and a quick list of full names.
export const STATE_NAMES: string[] = Object.keys(statesJson as Record<string, string>);
