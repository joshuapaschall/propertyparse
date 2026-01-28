import { listCitiesByState, listCounties, listStates } from './locations';
import { toFullState } from './stateNames';

const BASE = import.meta.env.VITE_API_BASE_URL as string;

async function expectJson(res: Response) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('not json');
  return res.json();
}

const norm = (value: string) => (value || '').trim().toLowerCase();

export async function searchStates(query: string) {
  const q = norm(query);
  const items = listStates()
    .map((i) => i.value)
    .filter((item) => !q || norm(item).includes(q));
  return { items };
}

export async function searchCounties(stateFullOrCode: string, query: string) {
  const stateFull = toFullState(stateFullOrCode);
  const q = norm(query);
  const items = listCounties(stateFull)
    .map((i) => i.value)
    .filter((item) => !q || norm(item).includes(q));
  return { items };
}

export async function searchCities(stateFullOrCode: string, _county: string, query: string) {
  const stateFull = toFullState(stateFullOrCode);
  const q = norm(query);
  const items = listCitiesByState(stateFull)
    .map((i) => i.value)
    .filter((item) => !q || norm(item).includes(q));
  return { items };
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
