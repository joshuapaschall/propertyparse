import { listCities, listCounties, listStates } from './locations';

const BASE = import.meta.env.VITE_API_BASE_URL as string;

async function expectJson(res: Response) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('not json');
  return res.json();
}

const dedupe = (arr: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    if (!s) continue;
    const k = s.trim();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
};

export async function searchStates(query: string) {
  const local = listStates(query).map((i) => i.value);
  try {
    const res = await fetch(`${BASE}/states/search?query=${encodeURIComponent(query || '')}`, { method: 'POST' });
    const remote = ((await expectJson(res)) as { items: string[] }).items || [];
    return { items: dedupe([...local, ...remote]) };
  } catch {
    return { items: local };
  }
}

export async function searchCounties(state: string, query: string) {
  const local = listCounties(state, query).map((i) => i.value);
  try {
    const url = `${BASE}/counties/search?state=${encodeURIComponent(state || '')}&query=${encodeURIComponent(query || '')}`;
    const res = await fetch(url, { method: 'POST' });
    const remote = ((await expectJson(res)) as { items: string[] }).items || [];
    return { items: dedupe([...local, ...remote]) };
  } catch {
    return { items: local };
  }
}

export async function searchCities(state: string, county: string, query: string) {
  const local = listCities(state, county, query).map((i) => i.value);
  try {
    const url = `${BASE}/cities/search?state=${encodeURIComponent(state || '')}&county=${encodeURIComponent(county || '')}&query=${encodeURIComponent(query || '')}`;
    const res = await fetch(url, { method: 'POST' });
    const remote = ((await expectJson(res)) as { items: string[] }).items || [];
    return { items: dedupe([...local, ...remote]) };
  } catch {
    return { items: local };
  }
}

export async function uploadFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/upload/file`, { method: 'POST', body: fd });
  return expectJson(res) as Promise<{ fileId: string; rowsReceived: number }>;
}

export async function parseFile(fileId: string, p: { state: string; county: string; city: string }) {
  const res = await fetch(`${BASE}/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileId, ...p }),
  });
  return expectJson(res) as Promise<{ total: number; items: any[] }>;
}
