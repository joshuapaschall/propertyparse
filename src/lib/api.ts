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

async function requestJson<T>(path: string, options: RequestInit) {
  const res = await fetch(joinUrl(path), options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
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
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
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
  matched?: unknown[];
  unmatched?: unknown[];
  items?: unknown[];
  total?: number;
  metadata?: Record<string, JsonValue>;
};

export async function searchStates(query: string, signal?: AbortSignal) {
  const res = await postJson<ApiResponse<string[]>>('/states/search', { query }, { signal });
  return res.items ?? (res.data as string[]) ?? [];
}

export async function searchCounties(state: string, query: string, signal?: AbortSignal) {
  const res = await postJson<ApiResponse<string[]>>('/counties/search', { state, query }, { signal });
  return res.items ?? (res.data as string[]) ?? [];
}

export async function searchCities(state: string, county: string, query: string, signal?: AbortSignal) {
  const res = await postJson<ApiResponse<string[]>>('/cities/search', { state, county, query }, { signal });
  return res.items ?? (res.data as string[]) ?? [];
}

export async function uploadFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestJson<UploadResponse>('/upload/file', { method: 'POST', body: fd });
}

export async function parseFile(fileId: string, payload: { state: string; county: string; city?: string }) {
  return postJson<ParseResponse>('/parse', { fileId, ...payload });
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
  const res = await requestJson<ApiResponse<JobRecord[]>>('/jobs', { method: 'GET' });
  return (res.items ?? res.data ?? res) as JobRecord[];
}

export async function getJob(jobId: string) {
  const res = await requestJson<ApiResponse<JobRecord>>(`/jobs/${jobId}`, { method: 'GET' });
  return (res.data ?? res.items ?? res) as JobRecord;
}

export async function downloadJobExport(jobId: string, type: JobExportType) {
  const res = await fetch(joinUrl(`/jobs/${jobId}/export?type=${type}`), { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const filename =
    getFilenameFromDisposition(res.headers.get('content-disposition')) ??
    `job-${jobId}-${type}.csv`;
  return { blob: await res.blob(), filename };
}
