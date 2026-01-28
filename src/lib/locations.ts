import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';
import { toFullState, STATE_NAMES } from './stateNames';

type Item = { value: string; label: string };
const norm = (s: string) => (s || '').toLowerCase().trim();

const titleCase = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function listStates(query: string): Item[] {
  const q = norm(query);
  return STATE_NAMES
    .filter((n) => !q || norm(n).includes(q))
    .map((n) => ({ value: n, label: n }));
}

export function listCounties(stateFullOrCode: string, query: string): Item[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];
  const q = norm(query);

  return (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => norm(c.State) === norm(stateFull) && (!q || norm(c.County).includes(q)))
    .map((c) => ({ value: c.County, label: c.County }));
}

export function listCities(stateFullOrCode: string, _county: string, query: string): Item[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];
  const q = norm(query);

  // data.json uses Title Case keys like "Georgia"
  const cityMap = citiesJson as Record<string, string[]>;
  const key = Object.keys(cityMap).find((k) => norm(k) === norm(stateFull)) || stateFull;

  const arr = cityMap[key] || [];
  return arr
    .map(titleCase) // nicer UX than ALL CAPS
    .filter((name) => !q || norm(name).includes(q))
    .map((name) => ({ value: name, label: name }));
}
