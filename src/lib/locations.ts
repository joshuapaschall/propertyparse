import statesJson from '../assets/states_json.json';
import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';
import { dedupeStrings, norm } from './dedupe';

type Item = { value: string; label: string };

export function listStates(query: string, limit = 50): Item[] {
  const q = norm(query);
  const names = Object.keys(statesJson as Record<string, string>);
  const filtered = names.filter((n) => !q || norm(n).includes(q));
  return filtered.slice(0, limit).map((n) => ({ value: n, label: n }));
}

export function listCounties(stateFull: string, query: string, limit = 50): Item[] {
  if (!stateFull) return [];
  const st = (statesJson as Record<string, string>)[stateFull];
  if (!st) return [];
  const q = norm(query);

  const raw = (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => c.State === st && (!q || norm(c.County).includes(q)))
    .map((c) => c.County);

  const uniq = dedupeStrings(raw);
  return uniq.slice(0, limit).map((n) => ({ value: n, label: n }));
}

export function listCities(stateFull: string, _county: string, query: string, limit = 50): Item[] {
  if (!stateFull) return [];
  // data.json keys might be uppercase; handle both
  const keyUpper = stateFull.toUpperCase();
  const keyExact = stateFull;
  const map = citiesJson as Record<string, string[]>;
  const arr = map[keyExact] || map[keyUpper] || [];

  const q = norm(query);
  const raw = arr.filter((name) => !q || norm(name).includes(q));
  const uniq = dedupeStrings(raw);
  return uniq.slice(0, limit).map((n) => ({ value: n, label: n }));
}
