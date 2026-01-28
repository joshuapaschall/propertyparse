import statesJsonRaw from '../assets/states_json.json';

type Map = Record<string, string>;
const raw = statesJsonRaw as Map;

const isKeyCode = Object.keys(raw).every((k) => /^[A-Z]{2}$/.test(k));
const isValCode = Object.values(raw).every((v) => /^[A-Z]{2}$/.test(v));

const invert = (m: Map): Map =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));

// Build both maps no matter which direction the JSON is.
export const STATE_CODE_TO_NAME: Map = isKeyCode ? raw : invert(raw);
export const STATE_NAME_TO_CODE: Map = isValCode ? raw : invert(raw);

// Canonical full name from either a code or a (possibly mis-cased) full name.
export function toFullState(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';

  // exact full-name match
  if (STATE_NAME_TO_CODE[s]) return s;

  // code match
  const upper = s.toUpperCase();
  if (STATE_CODE_TO_NAME[upper]) return STATE_CODE_TO_NAME[upper];

  // case-insensitive full-name match
  const found = Object.keys(STATE_NAME_TO_CODE).find((n) => n.toLowerCase() === s.toLowerCase());
  return found || s;
}

export const STATE_NAMES: string[] = Array.from(new Set(Object.values(STATE_CODE_TO_NAME).filter(Boolean))).sort(
  (a, b) => a.localeCompare(b)
);
