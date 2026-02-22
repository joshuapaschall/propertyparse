import { getAuthHeaderState } from './authState';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

type SearchPayload = {
  query: string;
  state?: string;
  county?: string;
  limit?: number;
};

type SearchResponse = {
  items?: string[];
  data?: string[];
  results?: string[];
};

const responseCache = new Map<string, string[]>();

const normalizeResults = (values: string[]) => {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return [...unique];
};

const getAuthHeaders = () => {
  const { accessToken, orgId, userId } = getAuthHeaderState();
  if (!accessToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(orgId ? { 'X-Org-Id': orgId } : {}),
    ...(userId ? { 'X-User-Id': userId } : {}),
  };
};

const buildCacheKey = (endpoint: string, payload: SearchPayload) => {
  const query = payload.query.trim().toLowerCase();
  const state = (payload.state ?? '').trim().toLowerCase();
  const county = (payload.county ?? '').trim().toLowerCase();
  const limit = payload.limit ?? '';
  return `${endpoint}|${state}|${county}|${query}|${limit}`;
};

async function postSearch(endpoint: string, payload: SearchPayload): Promise<string[]> {
  const cacheKey = buildCacheKey(endpoint, payload);
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const res = await fetch(joinUrl(endpoint), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Location search failed (${res.status}).`);
  }

  const json = (await res.json()) as SearchResponse | string[];
  const raw = Array.isArray(json)
    ? json
    : json.items ?? json.data ?? json.results ?? [];
  const normalized = normalizeResults(raw);
  responseCache.set(cacheKey, normalized);
  return normalized;
}

export async function searchStates(query: string, limit = 25) {
  return postSearch('/states/search', { query, limit });
}

export async function searchCounties(state: string, query: string, limit = 25) {
  return postSearch('/counties/search', { state, query, limit });
}

export async function searchCities(state: string, query: string, county?: string, limit = 25) {
  return postSearch('/cities/search', { state, query, county, limit });
}
