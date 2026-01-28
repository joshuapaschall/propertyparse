import countiesJson from '../assets/counties_list.json';
import citiesJson from '../assets/data.json';
import { STATE_NAMES, toFullState } from './stateNames';

type Item = { value: string; label: string };

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

export function listStates(): Item[] {
  // FULL names, alphabetical
  return STATE_NAMES.map((n) => ({ value: n, label: n }));
}

export function listCounties(stateFullOrCode: string): Item[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];

  // counties_list.json uses FULL state names in the "State" field.
  const raw = (countiesJson as Array<{ County: string; State: string }>)
    .filter((c) => (c.State || '').trim().toLowerCase() === stateFull.trim().toLowerCase())
    .map((c) => (c.County || '').trim())
    .filter(Boolean);

  // Counties are already mostly unique, but safe to dedupe + sort.
  const uniq = dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
  return uniq.map((n) => ({ value: n, label: n }));
}

export function listCitiesByState(stateFullOrCode: string): Item[] {
  const stateFull = toFullState(stateFullOrCode);
  if (!stateFull) return [];

  // data.json keys are FULL state names (canonical casing like "Georgia")
  const cityMap = citiesJson as Record<string, string[]>;

  // Find key case-insensitively (because user input casing can vary)
  const key =
    Object.keys(cityMap).find((k) => k.toLowerCase() === stateFull.toLowerCase()) || stateFull;

  const raw = (cityMap[key] || []).map((s) => (s || '').trim()).filter(Boolean);

  // DEDUPE (this is required; data.json contains duplicates)
  const uniq = dedupeStrings(raw).sort((a, b) => a.localeCompare(b));
  return uniq.map((n) => ({ value: n, label: n }));
}
