import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';
import { getAuthHeaderState } from './authState';

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
export type JobExportType =
  | 'matched'
  | 'unmatched'
  | 'unique_valid'
  | 'needs_review'
  | 'processing_report';

export const JOB_EXPORT_TYPES: JobExportType[] = [
  'unique_valid',
  'needs_review',
  'processing_report',
  'matched',
  'unmatched',
];
export type MeResponse = {
  userId: string;
  email: string;
  orgId: string;
  role: string;
};

export type MetricsRange = 'today' | 'week' | 'month' | 'year';

export type MetricsSummary = {
  uploads: number;
  leads: number;
  matched: number;
  unmatched: number;
  exports: number;
  googleCalls: number;
  ocrCalls?: number;
  ocrSpend?: number;
  [key: string]: JsonValue | undefined;
};

export type OrgMember = {
  userId: string;
  email: string;
  role: string;
  createdAt?: string;
  [key: string]: JsonValue | undefined;
};

export type SystemDiagnostics = {
  supabase_configured?: boolean;
  tables_missing?: string[];
  migrations_needed?: string[];
  [key: string]: JsonValue | undefined;
};

export type ApiErrorInfo = {
  message: string;
  endpoint: string;
  status?: number;
  isNetworkError?: boolean;
};

type ApiError = Error & { apiErrorInfo?: ApiErrorInfo };

const normalizedApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
const joinUrl = (path: string) =>
  new URL(path.startsWith('/') ? path.slice(1) : path, normalizedApiBaseUrl).toString();

const getAuthHeaders = () => {
  const { accessToken, orgId, userId } = getAuthHeaderState();
  if (!accessToken) {
    throw new Error('Missing auth context. Please sign in again.');
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(orgId ? { 'X-Org-Id': orgId } : {}),
    ...(userId ? { 'X-User-Id': userId } : {}),
  };
};

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

const createApiError = (info: ApiErrorInfo): ApiError => {
  const error = new Error(info.message) as ApiError;
  error.apiErrorInfo = info;
  return error;
};

export const getApiErrorInfo = (error: unknown): ApiErrorInfo | null => {
  if (error && typeof error === 'object' && 'apiErrorInfo' in error) {
    const info = (error as ApiError).apiErrorInfo;
    if (info && typeof info.message === 'string' && typeof info.endpoint === 'string') {
      return info;
    }
  }
  if (error instanceof Error) {
    return { message: error.message, endpoint: 'unknown' };
  }
  return null;
};

async function requestJson<T>(path: string, options: RequestInit) {
  let res: Response;
  try {
    res = await fetch(joinUrl(path), {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers ?? {}) },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw createApiError({
        message: `Network error (CORS or connectivity). Endpoint: ${path}. Check ALLOWED_ORIGINS on API.`,
        endpoint: path,
        isNetworkError: true,
      });
    }
    throw error;
  }
  if (!res.ok) {
    const detail = await getErrorMessage(res);
    throw createApiError({
      message: `HTTP ${res.status}: ${detail}`,
      endpoint: path,
      status: res.status,
    });
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw createApiError({
      message: `HTTP ${res.status}: Expected JSON response.`,
      endpoint: path,
      status: res.status,
    });
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

export async function parseFileAsync(
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
  return postJson<ParseResponse>(
    '/parse?async_mode=true',
    { fileId, ...payload },
    { headers: getAuthHeaders() },
  );
}

export async function retryParseRow(payload: unknown) {
  return postJson<ParseResponse>('/parse/retry', payload);
}

export async function retryParseBatch(payload: unknown) {
  return postJson<ParseResponse>('/parse/retry-batch', payload);
}

export async function retryJobRow(
  jobId: string,
  rowId: string,
  fullAddress: string,
  forceReverify = false,
) {
  return postJson<{
    updated_row_results?: RowResult[];
    updated_rows?: RowResult[];
    updated_job?: JobRecord;
  }>(
    `/jobs/${jobId}/retry-row`,
    {
      row_id: rowId,
      overrides: { address: fullAddress },
      force_reverify: forceReverify ?? false,
    },
  );
}

export async function retryJobBatch(
  jobId: string,
  rows: Array<{ rowId: string; fullAddress: string }>,
  forceReverify = false,
) {
  return postJson<{
    updated_row_results?: RowResult[];
    updated_rows?: RowResult[];
    updated_job?: JobRecord;
  }>(
    `/jobs/${jobId}/retry-batch`,
    {
      rows: rows.map((row) => ({
        row_id: row.rowId,
        edited: { full_address: row.fullAddress },
      })),
      force_reverify: forceReverify ?? false,
    },
  );
}

export async function getHealth() {
  return requestJson<JsonValue>('/health', { method: 'GET' });
}

export async function getMe(): Promise<MeResponse> {
  return requestJson<MeResponse>('/me', { method: 'GET', headers: getAuthHeaders() });
}

export async function acceptInvitation(): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>('/org/invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({}),
  });
}

export async function validateApiKeys() {
  return requestJson<JsonValue>('/validate-api-keys', { method: 'GET' });
}

export async function getJobs() {
  const res = await requestJson<ApiResponse<JobRecord[]>>('/jobs', { method: 'GET', headers: getAuthHeaders() });
  return (res.items ?? res.data ?? res) as JobRecord[];
}

export async function getMetricsSummary(range: MetricsRange) {
  const params = new URLSearchParams({ range });
  const res = await requestJson<ApiResponse<MetricsSummary>>(`/metrics/summary?${params.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.data ?? res.items ?? res) as MetricsSummary;
}

export async function getOrgMembers() {
  const res = await requestJson<ApiResponse<OrgMember[]>>('/org/members', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.items ?? res.data ?? res) as OrgMember[];
}

export async function getSystemDiagnostics() {
  const res = await requestJson<ApiResponse<SystemDiagnostics>>('/system/diagnostics', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.data ?? res.items ?? res) as SystemDiagnostics;
}

export async function inviteOrgMember(email: string, role: string) {
  return postJson<JsonValue>('/org/invite', { email, role }, { headers: getAuthHeaders() });
}

export async function updateOrgMemberRole(userId: string, role: string) {
  return requestJson<JsonValue>(`/org/members/${userId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ role }),
  });
}

export async function removeOrgMember(userId: string) {
  const res = await fetch(joinUrl(`/org/members/${userId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
}

export async function getJob(jobId: string) {
  const res = await requestJson<ApiResponse<JobRecord>>(`/jobs/${jobId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.job ?? res.data ?? res.items ?? res) as JobRecord;
}

export async function getJobWithStatus(jobId: string) {
  const res = await fetch(joinUrl(`/jobs/${jobId}`), {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (import.meta.env.DEV) {
    console.info(`[poll] GET /jobs/${jobId} -> ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Expected JSON response.');
  }
  const data = (await res.json()) as ApiResponse<JobRecord>;
  return {
    job: (data.job ?? data.data ?? data.items ?? data) as JobRecord,
    status: res.status,
  };
}

export async function getJobResults(jobId: string) {
  return requestJson<ParseResponse>(`/jobs/${jobId}/results`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
}

export async function getJobDetail(jobId: string) {
  return requestJson<{ job?: JobRecord; summary?: JobRecord }>(`/jobs/${jobId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
}

export async function getJobRows(
  jobId: string,
  status?: string,
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
