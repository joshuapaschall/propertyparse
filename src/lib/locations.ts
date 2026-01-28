import statesJson from '../assets/states_json.json';
import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';

type Item = { value: string; label: string };

const norm = (s: string) => (s || '').toLowerCase().trim();

export function listStates(query: string): Item[] {
  const q = norm(query);
  const names = Object.keys(statesJson);
  return names
    .filter((n) => !q || norm(n).includes(q))
    .slice(0, 50)
    .map((n) => ({ value: n, label: n }));
}

export function listCounties(stateFull: string, query: string): Item[] {
  if (!stateFull) return [];
  const st = (statesJson as Record<string, string>)[stateFull];
  const q = norm(query);
  return (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => c.State === st && (!q || norm(c.County).includes(q)))
    .slice(0, 50)
    .map((c) => ({ value: c.County, label: c.County }));
}

export function listCities(stateFull: string, county: string, query: string): Item[] {
  if (!stateFull) return [];
  const key = stateFull.toUpperCase();
  const q = norm(query);
  const arr = (citiesJson as Record<string, string[]>)[key] || [];
  return arr
    .filter((name) => !q || norm(name).includes(q))
    .slice(0, 50)
    .map((name) => ({ value: name, label: name }));
}
