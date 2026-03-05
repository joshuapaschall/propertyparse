import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';
import { getAuthHeaderState } from './authState';
import { supabase } from './supabase';

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
  | 'original_file'
  | 'unique_valid'
  | 'needs_review'
  | 'processing_report'
  | 'out_of_scope'
  | 'duplicates'
  | 'skipped';

export const JOB_EXPORT_TYPES: JobExportType[] = [
  'original_file',
  'unique_valid',
  'needs_review',
  'processing_report',
  'out_of_scope',
  'duplicates',
  'skipped',
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
  firstName?: string;
  lastName?: string;
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

const appendErrorId = (message: string, errorId: unknown) => {
  if (typeof errorId !== 'string' || !errorId.trim()) {
    return message;
  }
  if (message.includes(errorId)) {
    return message;
  }
  return `${message} (error_id=${errorId})`;
};

const getErrorMessage = async (res: Response) => {
  const text = await res.text();
  if (!text) {
    return `HTTP ${res.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error_id?: unknown };
    const errorId = parsed.error_id;
    if (typeof parsed.detail === 'string') {
      return appendErrorId(parsed.detail, errorId);
    }
    if (parsed.detail && typeof parsed.detail === 'object') {
      const detail = parsed.detail as { message?: unknown; code?: unknown };
      const detailMessage = typeof detail.message === 'string' ? detail.message : null;
      const detailCode = typeof detail.code === 'string' ? detail.code : null;
      if (detailMessage && detailCode && detailCode !== detailMessage) {
        return appendErrorId(`[${detailCode}] ${detailMessage}`, errorId);
      }
      if (detailMessage) {
        return appendErrorId(detailMessage, errorId);
      }
      if (detailCode) {
        return appendErrorId(detailCode, errorId);
      }
    }
    if (typeof errorId === 'string') {
      return appendErrorId(text, errorId);
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
      edited: { full_address: fullAddress },
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

export async function approveMatchedJobRow(
  jobId: string,
  payload: {
    rowId: string;
    applyToSameNormalizedInput?: boolean;
    allowScopeOverride?: boolean;
  },
) {
  return postJson<{
    updated_row_results?: RowResult[];
    updated_rows?: RowResult[];
    updated_job?: JobRecord;
  }>(`/jobs/${jobId}/approve-matched`, {
    row_id: payload.rowId,
    apply_to_same_normalized_input: payload.applyToSameNormalizedInput ?? false,
    allow_scope_override: payload.allowScopeOverride ?? false,
  });
}

export async function approveMatchedJobRowsBatch(
  jobId: string,
  rowIds: string[],
  allowScopeOverride = false,
) {
  return postJson<{
    updated_row_results?: RowResult[];
    updated_rows?: RowResult[];
    updated_job?: JobRecord;
    failed_rows?: Array<{
      row_id?: string;
      error?: string;
      status_code?: number;
    }>;
    metadata?: {
      requested_count?: number;
      approved_count?: number;
      failed_count?: number;
    };
  }>(`/jobs/${jobId}/approve-matched-batch`, {
    row_ids: rowIds,
    allow_scope_override: allowScopeOverride,
  });
}

export type NeedsReviewAiFixResponse = {
  updated_row_results?: RowResult[];
  updated_rows?: RowResult[];
  updated_job?: JobRecord;
  rows_processed?: number;
  ai_rows_processed?: number;
  estimated_extra_cost_usd?: number;
  attempted?: number;
  upgraded_to_valid?: number;
  still_needs_review?: number;
  still_out_of_scope?: number;
};

export async function runNeedsReviewAiFix(jobId: string) {
  return postJson<NeedsReviewAiFixResponse>(`/jobs/${jobId}/ai-fix-needs-review`, {
    include_out_of_scope_county: true,
  });
}

export type AiFixFlaggedResponse = {
  updated_row_results?: RowResult[];
  updated_rows?: RowResult[];
  updated_job?: JobRecord;
  attempted_count?: number;
  attempted?: number;
  upgraded_count?: number;
  upgraded_to_valid?: number;
  rewritten_count?: number;
  rewritten?: number;
  still_needs_review?: number;
  still_out_of_scope?: number;
};

export async function runAiFixFlaggedRows(jobId: string, includeOutOfScopeCounty = true) {
  return postJson<AiFixFlaggedResponse>(`/jobs/${jobId}/ai-fix-flagged?async_mode=true`, {
    include_out_of_scope_county: includeOutOfScopeCounty,
  });
}

export async function getHealth() {
  return requestJson<JsonValue>('/health', { method: 'GET' });
}

export async function getMe(): Promise<MeResponse> {
  return requestJson<MeResponse>('/me', { method: 'GET', headers: getAuthHeaders() });
}

export async function acceptInvitation(): Promise<{ ok: boolean }> {
  let headers: Record<string, string>;

  try {
    headers = getAuthHeaders();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('Missing auth context')) {
      throw error;
    }

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw error;
    }

    headers = { Authorization: `Bearer ${accessToken}` };
  }

  return requestJson<{ ok: boolean }>('/org/invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

export type InviteOrgMemberResponse = {
  ok?: boolean;
  message?: string;
  temporaryPassword?: string;
  tempPassword?: string;
  [key: string]: JsonValue | undefined;
};

export type InviteOrgMemberPayload = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  generateTemporaryPassword?: boolean;
  resend?: boolean;
};

export async function inviteOrgMember(payload: InviteOrgMemberPayload) {
  return postJson<InviteOrgMemberResponse>(
    '/org/invite',
    {
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email,
      role: payload.role,
      generate_temporary_password: payload.generateTemporaryPassword,
      resend: payload.resend,
    },
    { headers: getAuthHeaders() },
  );
}

export async function updateOrgMember(userId: string, payload: { firstName: string; lastName: string; role: string }) {
  return requestJson<JsonValue>(`/org/members/${userId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      first_name: payload.firstName,
      last_name: payload.lastName,
      role: payload.role,
    }),
  });
}

export async function resetOrgMemberPassword(userId: string) {
  return requestJson<JsonValue>(`/org/members/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({}),
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

export async function getJobResults(jobId: string, options?: { fresh?: boolean }) {
  const params = new URLSearchParams();
  if (options?.fresh) params.set('fresh', '1');
  const query = params.toString();
  const path = query ? `/jobs/${jobId}/results?${query}` : `/jobs/${jobId}/results`;
  return requestJson<ParseResponse>(path, {
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
