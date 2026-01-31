import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';
import { getOrCreateOrgId, getOrCreateUserId } from './identity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ApiResponse<T> = {
  data?: T;
  items?: T;
  metadata?: Record<string, JsonValue>;
  [key: string]: JsonValue | T | undefined;
};

export type JobRecord = Record<string, JsonValue>;
export type JobExportType = 'matched' | 'unmatched';

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

const getAuthHeaders = () => ({
  'X-Org-Id': getOrCreateOrgId(),
  'X-User-Id': getOrCreateUserId(),
});

const getErrorMessage = async (res: Response) => {
  const text = await res.text();
  if (!text) {
    return `HTTP ${res.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    if (typeof parsed.detail === 'string') {
      return parsed.detail;
    }
  } catch {
    return text;
  }
  return text;
};

async function requestJson<T>(path: string, options: RequestInit) {
  const res = await fetch(joinUrl(path), {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Expected JSON response.');
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown, options: RequestInit = {}) {
  return requestJson<T>(path, {
    ...options,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...getAuthHeaders(), ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
}

const getFilenameFromDisposition = (value: string | null) => {
  if (!value) return null;
  const match = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i.exec(value);
  if (!match) return null;
  return decodeURIComponent(match[1]);
};

export type UploadResponse = {
  fileId: string;
  rowsReceived: number;
};

export type ParseResponse = {
  summary?: ParseSummary;
  canonical_addresses?: CanonicalAddress[];
  row_results?: RowResult[];
  duplicate_groups?: DuplicateGroup[];
  debug?: ParseDebugInfo;
  matched?: unknown[];
  unmatched?: unknown[];
  items?: unknown[];
  total?: number;
  metadata?: Record<string, JsonValue>;
};

export async function searchStates(query: string, limit = 1000, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await postJson<ApiResponse<string[]>>(`/states/search?${params.toString()}`, { query }, { signal });
  return res.items ?? (res.data as string[]) ?? [];
}

export async function searchCounties(state: string, query: string, limit = 5000, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await postJson<ApiResponse<string[]>>(
    `/counties/search?${params.toString()}`,
    { state, query },
    { signal },
  );
  return res.items ?? (res.data as string[]) ?? [];
}

export async function searchCities(state: string, county: string, query: string, limit = 50000, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await postJson<ApiResponse<string[]>>(
    `/cities/search?${params.toString()}`,
    { state, county, query },
    { signal },
  );
  return res.items ?? (res.data as string[]) ?? [];
}

export async function uploadFile(file: File, displayName?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (displayName) {
    fd.append('displayName', displayName);
  }
  return requestJson<UploadResponse>('/upload/file', {
    method: 'POST',
    body: fd,
    headers: getAuthHeaders(),
  });
}

export async function parseFile(
  fileId: string,
  payload: {
    state: string;
    county: string;
    city?: string;
    force_refresh?: boolean;
    jobId?: string;
    jobName?: string;
  },
) {
  return postJson<ParseResponse>('/parse', { fileId, ...payload }, { headers: getAuthHeaders() });
}

export async function retryParseRow(payload: unknown) {
  return postJson<ParseResponse>('/parse/retry', payload);
}

export async function retryParseBatch(payload: unknown) {
  return postJson<ParseResponse>('/parse/retry-batch', payload);
}

export async function getHealth() {
  return requestJson<JsonValue>('/health', { method: 'GET' });
}

export async function validateApiKeys() {
  return requestJson<JsonValue>('/validate-api-keys', { method: 'GET' });
}

export async function getJobs() {
  const res = await requestJson<ApiResponse<JobRecord[]>>('/jobs', { method: 'GET', headers: getAuthHeaders() });
  return (res.items ?? res.data ?? res) as JobRecord[];
}

export async function getJob(jobId: string) {
  const res = await requestJson<ApiResponse<JobRecord>>(`/jobs/${jobId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.job ?? res.data ?? res.items ?? res) as JobRecord;
}

export async function getJobDetail(jobId: string) {
  return requestJson<{ job?: JobRecord; summary?: JobRecord }>(`/jobs/${jobId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
}

export async function getJobRows(
  jobId: string,
  status?: 'Matched' | 'Unmatched',
  limit?: number,
  offset?: number,
) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const query = params.toString();
  const path = query ? `/jobs/${jobId}/rows?${query}` : `/jobs/${jobId}/rows`;
  const res = await requestJson<ApiResponse<JobRecord[]>>(path, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.items ?? res.data ?? res) as JobRecord[];
}

export async function downloadJobExport(jobId: string, type: JobExportType) {
  const res = await fetch(joinUrl(`/jobs/${jobId}/export?type=${type}`), {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
  const filename =
    getFilenameFromDisposition(res.headers.get('content-disposition')) ??
    `job-${jobId}-${type}.csv`;
  return { blob: await res.blob(), filename };
}
