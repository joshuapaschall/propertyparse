export const norm = (s: string) => (s || '').trim().toLowerCase();

export function dedupeStrings(values: string[]) {
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
