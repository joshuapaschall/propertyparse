import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';
import { toFullState } from './stateNames';

const norm = (s: string) => (s || '').trim().toLowerCase();

function dedupeStrings(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values || []) {
    const raw = (v || '').trim();
    if (!raw) continue;
    const k = norm(raw);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(raw);
  }
  return out;
}

const STATE_CODES_50 = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();

export function listStates50(): string[] {
  const names = STATE_CODES_50.map((code) => toFullState(code)).filter(Boolean);
  return dedupeStrings(names).sort((a, b) => a.localeCompare(b));
}

export function listCounties(stateFullOrCode: string): string[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];

  // counties_list.json uses FULL state names in the "State" field.
  const raw = (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => (c.State || '').trim().toLowerCase() === stateFull.trim().toLowerCase())
    .map((c) => (c.County || '').trim())
    .filter(Boolean);

  // Counties are already mostly unique, but safe to dedupe + sort.
  return dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
}

export function listCitiesByState(stateFullOrCode: string): string[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];

  // data.json keys are FULL state names (canonical casing like "Georgia")
  const cityMap = citiesJson as Record<string, string[]>;

  // Find key case-insensitively (because user input casing can vary)
  const key =
    Object.keys(cityMap).find((k) => k.toLowerCase() === stateFull.toLowerCase()) || stateFull;

  const raw = (cityMap[key] || [])
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .map((s) => toTitleCase(s));

  // DEDUPE (this is required; data.json contains duplicates)
  return dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
}
