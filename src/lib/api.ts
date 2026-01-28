import { listCities, listCounties, listStates } from './locations';

const BASE = import.meta.env.VITE_API_BASE_URL as string;

async function expectJson(res: Response) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('not json');
  return res.json();
}

export async function searchStates(query: string) {
  const local = listStates(query).map((i) => i.value);
  if (local.length) return { items: local };

  try {
    const res = await fetch(`${BASE}/states/search?query=${encodeURIComponent(query || '')}`, { method: 'POST' });
    return (await expectJson(res)) as { items: string[] };
  } catch {
    return { items: [] };
  }
}

export async function searchCounties(stateFull: string, query: string) {
  const local = listCounties(stateFull, query).map((i) => i.value);
  if (local.length) return { items: local };

  try {
    const url = `${BASE}/counties/search?state=${encodeURIComponent(stateFull || '')}&query=${encodeURIComponent(query || '')}`;
    const res = await fetch(url, { method: 'POST' });
    return (await expectJson(res)) as { items: string[] };
  } catch {
    return { items: [] };
  }
}

export async function searchCities(stateFull: string, county: string, query: string) {
  const local = listCities(stateFull, county, query).map((i) => i.value);
  if (local.length) return { items: local };

  try {
    const url = `${BASE}/cities/search?state=${encodeURIComponent(stateFull || '')}&county=${encodeURIComponent(county || '')}&query=${encodeURIComponent(query || '')}`;
    const res = await fetch(url, { method: 'POST' });
    return (await expectJson(res)) as { items: string[] };
  } catch {
    return { items: [] };
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
