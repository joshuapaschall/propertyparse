const BASE = import.meta.env.VITE_API_BASE_URL as string;

async function expectJson(res: Response) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Expected JSON, got ${ct}. Body: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function searchStates(query: string) {
  const res = await fetch(`${BASE}/states/search?query=${encodeURIComponent(query || '')}`, { method: 'POST' });
  return expectJson(res) as Promise<{ items: string[] }>;
}

export async function searchCounties(state: string, query: string) {
  const url = `${BASE}/counties/search?state=${encodeURIComponent(state || '')}&query=${encodeURIComponent(query || '')}`;
  const res = await fetch(url, { method: 'POST' });
  return expectJson(res) as Promise<{ items: string[] }>;
}

export async function searchCities(state: string, county: string, query: string) {
  const url = `${BASE}/cities/search?state=${encodeURIComponent(state || '')}&county=${encodeURIComponent(county || '')}&query=${encodeURIComponent(query || '')}`;
  const res = await fetch(url, { method: 'POST' });
  return expectJson(res) as Promise<{ items: string[] }>;
}

export async function uploadFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/upload/file`, { method: 'POST', body: fd });
  return expectJson(res) as Promise<{ fileId: string; rowsReceived: number }>;
}
