import { getAuthHeaderState } from './authState';
import { ensureFreshSession } from './sessionRefresh';
import { toFullState } from './stateNames';

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

const RESPONSE_CACHE_MAX_ENTRIES = 256;

class LruStringArrayCache {
  private readonly map = new Map<string, string[]>();
  constructor(private readonly maxEntries: number) {}
  get(key: string): string[] | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // refresh insertion order so it becomes most-recently-used
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: string, value: string[]): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  // exposed for tests only — not used in app code
  get size(): number {
    return this.map.size;
  }
}

const responseCache = new LruStringArrayCache(RESPONSE_CACHE_MAX_ENTRIES);
const AUTH_FAILURE_STATUSES = new Set([401, 403]);

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

async function postSearch(
  endpoint: string,
  payload: SearchPayload,
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const cacheKey = buildCacheKey(endpoint, payload);
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const authHeaders = getAuthHeaders();
  const bearerToken =
    'Authorization' in authHeaders
      ? String(authHeaders.Authorization ?? '').replace(/^Bearer\s+/i, '') || null
      : null;

  const execute = async () =>
    fetch(joinUrl(endpoint), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal,
    });

  let res = await execute();

  if (AUTH_FAILURE_STATUSES.has(res.status)) {
        try {
          await ensureFreshSession(bearerToken);
    } catch {
      // refresh failed — fall through with the original 4xx
    }
    if (!signal?.aborted) {
      res = await execute();
    }
  }

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

export async function searchStates(query: string, limit = 100, signal?: AbortSignal) {
  return postSearch('/states/search', { query, limit }, signal);
}

export async function searchCounties(state: string, query: string, limit = 5000, signal?: AbortSignal) {
  return postSearch('/counties/search', { state: toFullState(state), query, limit }, signal);
}

export async function searchCities(state: string, query: string, county?: string, limit = 50000, signal?: AbortSignal) {
  return postSearch('/cities/search', { state: toFullState(state), query, county, limit }, signal);
}
