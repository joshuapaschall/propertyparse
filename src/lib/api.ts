import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';
import { getAuthHeaderState } from './authState';
import { AUTH_FAILURE_MESSAGE, ensureFreshSession } from './sessionRefresh';
import type { ExportCatalogResponseItem } from '../types/exports';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set.');
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ApiResponse<T> = {
  data?: T;
  items?: T;
  metadata?: Record<string, JsonValue>;
  total_count?: number;
  totalCount?: number;
  [key: string]: JsonValue | T | undefined;
};

export type JobRecord = Record<string, JsonValue>;

export type JobsQuery = {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  scope?: string;
};

export type JobsResponse = {
  items: JobRecord[];
  totalCount: number;
};
export type JobExportType =
  | 'original_file'
  | 'propstream_import'
  | 'unique_valid'
  | 'needs_review'
  | 'processing_report'
  | 'out_of_scope'
  | 'duplicates'
  | 'skipped';

export const JOB_EXPORT_TYPES: JobExportType[] = [
  'original_file',
  'propstream_import',
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
  customer_safe_usage?: Record<string, JsonValue>;
  internal_admin_usage?: Record<string, JsonValue>;
  reconciliation?: Record<string, JsonValue>;
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

export type ProviderUsageGoogleStatus = {
  sync_status?: string | null;
  pricing_source?: string | null;
  pricing_confidence?: string | null;
  billing_snapshot_as_of?: string | null;
  snapshot_rows_count?: number | null;
  remaining_free_cap_status_mode?: string | null;
  billing_snapshot_missing?: boolean;
  missing_env_vars?: string[];
  missing_config_env_vars?: string[];
  google_billing_sync_configured?: boolean;
  billing_sync_configured?: boolean;
  last_sync_timestamp?: string | null;
  [key: string]: JsonValue | undefined;
};

export type ProviderUsageOpenAiSummary = {
  sync_status?: string | null;
  last_sync_timestamp?: string | null;
  project_id?: string | null;
  [key: string]: JsonValue | undefined;
};

export type ProviderUsageSyncResponse = {
  ok?: boolean;
  message?: string;
  sync_status?: string | null;
  last_sync_timestamp?: string | null;
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

const AUTH_FAILURE_STATUSES = new Set([401, 403]);

const toFriendlyAuthMessage = (status: number, detail: string) => {
  const lowered = detail.toLowerCase();
  if (
    AUTH_FAILURE_STATUSES.has(status) &&
    ['jwt', 'token', 'session', 'expired', 'refresh', 'signature', 'unauthorized', 'forbidden'].some((term) =>
      lowered.includes(term),
    )
  ) {
    return AUTH_FAILURE_MESSAGE;
  }
  return `HTTP ${status}: ${detail}`;
};

const refreshAuthHeadersFromSession = async () => {
  const refreshed = await ensureFreshSession(getAuthHeaderState().accessToken);
  return {
    Authorization: `Bearer ${refreshed.accessToken}`,
    ...(getAuthHeaderState().orgId ? { 'X-Org-Id': getAuthHeaderState().orgId } : {}),
    ...(getAuthHeaderState().userId ? { 'X-User-Id': getAuthHeaderState().userId } : {}),
  };
};

const performAuthedFetch = async (path: string, options: RequestInit, retryOnAuthFailure = true): Promise<Response> => {
  const execute = async (headers: Record<string, string>) =>
    fetch(joinUrl(path), {
      ...options,
      headers: { ...(options.headers ?? {}), ...headers },
    });

  let res: Response;
  try {
    res = await execute(getAuthHeaders());
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

  if (retryOnAuthFailure && AUTH_FAILURE_STATUSES.has(res.status)) {
    try {
      const refreshedHeaders = await refreshAuthHeadersFromSession();
      res = await execute(refreshedHeaders);
    } catch (error) {
      if (error && typeof error === 'object' && 'apiErrorInfo' in error) {
        throw error;
      }
      throw createApiError({
        message: AUTH_FAILURE_MESSAGE,
        endpoint: path,
        status: res.status,
      });
    }

    if (AUTH_FAILURE_STATUSES.has(res.status)) {
      throw createApiError({
        message: AUTH_FAILURE_MESSAGE,
        endpoint: path,
        status: res.status,
      });
    }
  }

  return res;
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
  const res = await performAuthedFetch(path, options);
  if (!res.ok) {
    const detail = await getErrorMessage(res);
    throw createApiError({
      message: toFriendlyAuthMessage(res.status, detail),
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


const pickKnownFilename = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const getOriginalUploadFilenameFallback = async (jobId: string) => {
  const [catalogResult, detailResult] = await Promise.allSettled([
    getJobExportCatalog(jobId),
    getJobDetail(jobId),
  ]);

  const catalogFilename =
    catalogResult.status === 'fulfilled'
      ? pickKnownFilename(catalogResult.value.find((item) => item.type === 'original_file')?.filename)
      : null;

  const detailRecord =
    detailResult.status === 'fulfilled'
      ? ((detailResult.value.job ?? detailResult.value.summary ?? {}) as JobRecord)
      : null;
  const originalFileRecord =
    detailRecord && typeof detailRecord.original_file === 'object' && !Array.isArray(detailRecord.original_file)
      ? (detailRecord.original_file as JobRecord)
      : null;

  return pickKnownFilename(
    catalogFilename,
    originalFileRecord?.original_filename,
    originalFileRecord?.file_name,
    originalFileRecord?.filename,
    detailRecord?.original_filename,
    detailRecord?.file_name,
    detailRecord?.filename,
  );
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
    forceOverride?: boolean;
    overrideReason?: string;
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
    force_override: payload.forceOverride ?? false,
    override_reason: payload.overrideReason,
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

export async function getJobs(query: JobsQuery = {}): Promise<JobsResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.offset === 'number') params.set('offset', String(query.offset));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status?.trim()) params.set('status', query.status.trim());
  if (query.scope?.trim()) params.set('scope', query.scope.trim());

  const path = params.toString() ? `/jobs?${params.toString()}` : '/jobs';
  const res = await requestJson<ApiResponse<JobRecord[]> | JobRecord[]>(path, { method: 'GET', headers: getAuthHeaders() });

  if (Array.isArray(res)) {
    return { items: res, totalCount: res.length };
  }

  const items = (res.items ?? res.data ?? []) as JobRecord[];
  const totalCountRaw = res.total_count ?? res.totalCount;
  const totalCount = typeof totalCountRaw === 'number' ? totalCountRaw : items.length;
  return { items, totalCount };
}

export async function getMetricsSummary(range: MetricsRange, options?: { startDate?: string; endDate?: string }) {
  const params = new URLSearchParams({ range });
  if (options?.startDate) params.set('start_date', options.startDate);
  if (options?.endDate) params.set('end_date', options.endDate);
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

export async function getGoogleProviderUsageStatus() {
  const res = await requestJson<ApiResponse<ProviderUsageGoogleStatus>>('/admin/provider-usage/google/status', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.data ?? res.items ?? res) as ProviderUsageGoogleStatus;
}

export async function syncGoogleProviderUsage() {
  const res = await postJson<ApiResponse<ProviderUsageSyncResponse>>('/admin/provider-usage/google/sync', {});
  return (res.data ?? res.items ?? res) as ProviderUsageSyncResponse;
}

export async function getOpenAiProviderUsageSummary() {
  const res = await requestJson<ApiResponse<ProviderUsageOpenAiSummary>>('/admin/provider-usage/openai/summary', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return (res.data ?? res.items ?? res) as ProviderUsageOpenAiSummary;
}

export async function syncOpenAiProviderUsage() {
  const res = await postJson<ApiResponse<ProviderUsageSyncResponse>>('/admin/provider-usage/openai/sync', {});
  return (res.data ?? res.items ?? res) as ProviderUsageSyncResponse;
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
  const path = `/org/members/${userId}`;
  const res = await performAuthedFetch(path, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw createApiError({
      message: toFriendlyAuthMessage(res.status, await getErrorMessage(res)),
      endpoint: path,
      status: res.status,
    });
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
  const path = `/jobs/${jobId}`;
  const res = await performAuthedFetch(path, {
    method: 'GET',
  });
  if (import.meta.env.DEV) {
    console.info(`[poll] GET /jobs/${jobId} -> ${res.status}`);
  }
  if (!res.ok) {
    throw createApiError({
      message: toFriendlyAuthMessage(res.status, await getErrorMessage(res)),
      endpoint: path,
      status: res.status,
    });
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
  options?: {
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (typeof options?.limit === 'number') params.set('limit', String(options.limit));
  if (typeof options?.offset === 'number') params.set('offset', String(options.offset));
  const query = params.toString();
  const path = query ? `/jobs/${jobId}/rows?${query}` : `/jobs/${jobId}/rows`;
  const res = await requestJson<
    ApiResponse<JobRecord[]> & {
      total?: number;
      limit?: number;
      offset?: number;
    }
  >(path, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const items = (res.items ?? res.data ?? []) as JobRecord[];
  return {
    items,
    total: typeof res.total === 'number' ? res.total : items.length,
    limit: typeof res.limit === 'number' ? res.limit : options?.limit ?? items.length,
    offset: typeof res.offset === 'number' ? res.offset : options?.offset ?? 0,
  };
}

export async function getAllJobRows(jobId: string) {
  const firstPage = await getJobRows(jobId, { offset: 0 });
  const rows = [...firstPage.items];
  const pageSize = Math.max(firstPage.limit || firstPage.items.length || 200, 1);
  let nextOffset = firstPage.offset + firstPage.items.length;

  while (rows.length < firstPage.total) {
    const page = await getJobRows(jobId, { limit: pageSize, offset: nextOffset });
    if (!page.items.length) {
      break;
    }
    rows.push(...page.items);
    nextOffset += page.items.length;
  }

  return rows;
}

export async function updateJobMetadata(jobId: string, payload: { campaignName: string }) {
  return requestJson<JsonValue>(`/jobs/${jobId}/metadata`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ campaign_name: payload.campaignName }),
  });
}

export async function downloadJobExport(jobId: string, type: JobExportType) {
  const path = `/jobs/${jobId}/export?type=${type}`;
  const res = await performAuthedFetch(path, {
    method: 'GET',
  });
  if (!res.ok) {
    const detail = await getErrorMessage(res);
    throw createApiError({
      message:
        type === 'original_file' && res.status === 404
          ? 'The original upload is unavailable for this job.'
          : toFriendlyAuthMessage(res.status, detail),
      endpoint: path,
      status: res.status,
    });
  }
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || blob.type || null;
  const sizeBytesHeader = res.headers.get('content-length');
  const filenameFromHeader = getFilenameFromDisposition(res.headers.get('content-disposition'));
  const filenameFromMetadata =
    type === 'original_file' && !filenameFromHeader ? await getOriginalUploadFilenameFallback(jobId) : null;
  const filename =
    filenameFromHeader ??
    filenameFromMetadata ??
    `job-${jobId}-${type}.${type === 'original_file' ? 'bin' : 'csv'}`;
  return {
    blob,
    filename,
    contentType,
    sizeBytes:
      typeof blob.size === 'number' && blob.size > 0
        ? blob.size
        : sizeBytesHeader && Number.isFinite(Number(sizeBytesHeader))
          ? Number(sizeBytesHeader)
          : null,
  };
}

export async function getJobExportCatalog(jobId: string) {
  const res = await requestJson<ApiResponse<ExportCatalogResponseItem[]> & { catalog?: ExportCatalogResponseItem[] }>(
    `/jobs/${jobId}/exports/catalog`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );
  return (res.catalog ?? res.items ?? res.data ?? []) as ExportCatalogResponseItem[];
}
