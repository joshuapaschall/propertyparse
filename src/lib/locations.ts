import statesJson from '../assets/states_json.json';
import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';
import { dedupeStrings, norm } from './dedupe';

type Item = { value: string; label: string };

// states_json.json shape: { "Alabama": "AL", ... }
const STATES_MAP = statesJson as Record<string, string>;

export function listStates(query: string): Item[] {
  const q = norm(query);
  const names = Object.keys(STATES_MAP)
    .filter((n) => !q || norm(n).includes(q))
    .sort((a, b) => a.localeCompare(b));
  return names.map((n) => ({ value: n, label: n })); // FULL NAMES
}

export function listCounties(stateFull: string, query: string): Item[] {
  if (!stateFull) return [];
  const code = STATES_MAP[stateFull];
  if (!code) return [];
  const q = norm(query);

  const raw = (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => c.State === code && (!q || norm(c.County).includes(q)))
    .map((c) => c.County);

  const uniq = dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
  return uniq.map((n) => ({ value: n, label: n }));
}

// City depends ONLY on state (ignore county here)
export function listCities(stateFull: string, query: string): Item[] {
  if (!stateFull) return [];
  const keyUpper = stateFull.toUpperCase();
  const map = citiesJson as Record<string, string[]>;
  const arr = map[keyUpper] || [];

  const q = norm(query);
  const raw = arr.filter((name) => !q || norm(name).includes(q));
  const uniq = dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
  return uniq.map((n) => ({ value: n, label: n }));
}
