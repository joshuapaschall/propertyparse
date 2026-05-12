import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      refreshSession: (...args: unknown[]) => refreshSession(...args),
    },
  },
}));

describe('API error handling', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-token', user: { id: 'user-123' } } }, error: null });

    const { setAuthHeaderState } = await import('./authState');
    setAuthHeaderState({
      accessToken: 'token-123',
      orgId: 'org-123',
      userId: 'user-123',
      role: 'admin',
    });
  });

  afterEach(async () => {
    const { clearAuthHeaderState } = await import('./authState');
    clearAuthHeaderState();
    vi.unstubAllEnvs();
  });

  it('surfaces structured backend detail for ai-fix-flagged errors', async () => {
    const errorResponseBody = JSON.stringify({
      detail: {
        code: 'AI_FIX_PARSE_FAILED',
        message: 'Could not parse one or more flagged rows',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(errorResponseBody, {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(errorResponseBody, {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const { runAiFixFlaggedRows, getApiErrorInfo } = await import('./api');

    await expect(runAiFixFlaggedRows('job-123', true)).rejects.toMatchObject({
      message: 'HTTP 500: [AI_FIX_PARSE_FAILED] Could not parse one or more flagged rows',
    });

    try {
      await runAiFixFlaggedRows('job-123', true);
    } catch (error) {
      const info = getApiErrorInfo(error);
      expect(info?.message).toBe('HTTP 500: [AI_FIX_PARSE_FAILED] Could not parse one or more flagged rows');
      expect(info?.status).toBe(500);
      expect(info?.endpoint).toBe('/jobs/job-123/ai-fix-flagged?async_mode=true');
      return;
    }

    throw new Error('Expected runAiFixFlaggedRows to throw');
  });

  it('retries once after refreshing the session on auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('expired token', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { ok: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const { getMetricsSummary } = await import('./api');
    const result = await getMetricsSummary('today');

    expect(result).toEqual({ ok: true });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer refreshed-token' }),
    });
  });

  it('surfaces clean product wording when auth retry still fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('jwt expired', { status: 401 }))
        .mockResolvedValueOnce(new Response('jwt expired', { status: 401 })),
    );

    const { getMetricsSummary } = await import('./api');
    await expect(getMetricsSummary('today')).rejects.toMatchObject({
      message: 'We couldn’t verify your session. Sign in again.',
    });
  });

  it('does not refresh on 403 when org membership was lost (B42)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: 'User has no org membership. Call /auth/bootstrap' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { getMetricsSummary } = await import('./api');
    await expect(getMetricsSummary('today')).rejects.toMatchObject({
      message: 'Your access to this workspace was removed. Contact your admin to be re-invited.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('surfaces membership-lost message after refresh races with membership change (B42)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('jwt expired', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ detail: 'User has no org membership. Call /auth/bootstrap' }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          ),
        ),
    );

    const { getMetricsSummary } = await import('./api');
    await expect(getMetricsSummary('today')).rejects.toMatchObject({
      message: 'Your access to this workspace was removed. Contact your admin to be re-invited.',
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('sends Authorization + X-Org-Id headers for validateApiKeys (audit B76)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ google_key_present: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const { validateApiKeys } = await import('./api');
    await validateApiKeys();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init && 'headers' in init ? init.headers : undefined);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Org-Id')).toBe('org-123');
  });

  it('uploadFile forwards AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ fileId: 'f1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { uploadFile } = await import('./api');
    const controller = new AbortController();
    const mockFile = new File(['a'], 'sample.csv', { type: 'text/csv' });
    await uploadFile(mockFile, undefined, controller.signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it('uploadFile rejects immediately when signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { uploadFile } = await import('./api');
    const controller = new AbortController();
    controller.abort();
    const mockFile = new File(['a'], 'sample.csv', { type: 'text/csv' });

    await expect(uploadFile(mockFile, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getJobWithStatus forwards AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job: { job_id: 'job-123', status: 'RUNNING' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getJobWithStatus } = await import('./api');
    const controller = new AbortController();
    await getJobWithStatus('job-123', controller.signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

});

describe('export APIs', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { setAuthHeaderState } = await import('./authState');
    setAuthHeaderState({
      accessToken: 'token-123',
      orgId: 'org-123',
      userId: 'user-123',
      role: 'admin',
    });
  });

  afterEach(async () => {
    const { clearAuthHeaderState } = await import('./authState');
    clearAuthHeaderState();
    vi.unstubAllEnvs();
  });

  it('loads export catalog from backend endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            catalog: [
              {
                type: 'propstream_import',
                label: 'PropStream Import',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const { getJobExportCatalog } = await import('./api');
    const catalog = await getJobExportCatalog('job-123');

    expect(catalog).toEqual([
      {
        type: 'propstream_import',
        label: 'PropStream Import',
      },
    ]);
  });

  it('preserves original file names and extensions for original upload exports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('raw-bytes', {
          status: 200,
          headers: {
            'content-type': 'application/vnd.ms-excel',
            'content-disposition': "attachment; filename*=UTF-8''source-upload.xlsx",
            'content-length': '9',
          },
        }),
      ),
    );

    const { downloadJobExport } = await import('./api');
    const result = await downloadJobExport('job-123', 'original_file');

    expect(result.filename).toBe('source-upload.xlsx');
    expect(result.contentType).toBe('application/vnd.ms-excel');
    expect(result.sizeBytes).toBe(9);
  });

  it('uses catalog metadata before job metadata when the header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response('raw-bytes', {
            status: 200,
            headers: {
              'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              catalog: [{ type: 'original_file', filename: 'catalog-source.xlsx' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              job: {
                original_file: { filename: 'job-source.xlsx' },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    );

    const { downloadJobExport } = await import('./api');
    const result = await downloadJobExport('job-123', 'original_file');

    expect(result.filename).toBe('catalog-source.xlsx');
  });
});


describe('provider usage admin APIs', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { setAuthHeaderState } = await import('./authState');
    setAuthHeaderState({
      accessToken: 'token-123',
      orgId: 'org-123',
      userId: 'user-123',
      role: 'owner',
    });
  });

  afterEach(async () => {
    const { clearAuthHeaderState } = await import('./authState');
    clearAuthHeaderState();
    vi.unstubAllEnvs();
  });

  it('loads google and openai provider usage summaries from the admin endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { sync_status: 'ready', snapshot_rows_count: 8 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { sync_status: 'ready', project_id: 'proj_123' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const { getGoogleProviderUsageStatus, getOpenAiProviderUsageSummary } = await import('./api');

    await expect(getGoogleProviderUsageStatus()).resolves.toEqual({ sync_status: 'ready', snapshot_rows_count: 8 });
    await expect(getOpenAiProviderUsageSummary()).resolves.toEqual({ sync_status: 'ready', project_id: 'proj_123' });
  });

  it('posts to the google and openai sync endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { ok: true, message: 'Google sync started' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { ok: true, message: 'OpenAI sync started' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const { syncGoogleProviderUsage, syncOpenAiProviderUsage } = await import('./api');

    await expect(syncGoogleProviderUsage()).resolves.toEqual({ ok: true, message: 'Google sync started' });
    await expect(syncOpenAiProviderUsage()).resolves.toEqual({ ok: true, message: 'OpenAI sync started' });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/admin/provider-usage/google/sync');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example.com/admin/provider-usage/openai/sync');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });
});


describe('jobs API', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { setAuthHeaderState } = await import('./authState');
    setAuthHeaderState({
      accessToken: 'token-123',
      orgId: 'org-123',
      userId: 'user-123',
      role: 'admin',
    });
  });

  afterEach(async () => {
    const { clearAuthHeaderState } = await import('./authState');
    clearAuthHeaderState();
    vi.unstubAllEnvs();
  });

  it('passes pagination and filters to /jobs and returns total count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ job_id: 'job-21', display_name: 'Job 21' }],
          total_count: 55,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getJobs } = await import('./api');
    const result = await getJobs({ limit: 20, offset: 20, search: 'march', status: 'DONE' });

    expect(result).toEqual({
      items: [{ job_id: 'job-21', display_name: 'Job 21' }],
      totalCount: 55,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/jobs?limit=20&offset=20&search=march&status=DONE',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});


describe('parse payload APIs', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { setAuthHeaderState } = await import('./authState');
    setAuthHeaderState({ accessToken: 'token-123', orgId: 'org-123', userId: 'user-123', role: 'admin' });
  });

  afterEach(async () => {
    const { clearAuthHeaderState } = await import('./authState');
    clearAuthHeaderState();
    vi.unstubAllEnvs();
  });

  it('sends scope_mode, localities, and legacy city in parse requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { parseFile } = await import('./api');

    await parseFile('file-123', {
      state: 'Georgia',
      counties: ['DeKalb'],
      city: 'Stonecrest',
      localities: ['Stonecrest', 'Lithonia'],
      scope_mode: 'locality_strict',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/parse',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          fileId: 'file-123',
          state: 'Georgia',
          counties: ['DeKalb'],
          city: 'Stonecrest',
          localities: ['Stonecrest', 'Lithonia'],
          scope_mode: 'locality_strict',
        }),
      }),
    );
  });

  it('createBatch posts the payload to /batches with auth headers', async () => {
    const fakeBatch = {
      id: 'batch-abc',
      org_id: 'org-123',
      user_id: 'user-123',
      name: 'Friday screenshots',
      status: 'PENDING',
      state: 'Georgia',
      county: 'DeKalb County',
      counties: ['DeKalb County'],
      city: null,
      localities: [],
      scope_mode: 'county_wide',
      campaign_name: null,
      metadata: {},
      created_at: '2026-05-12T00:00:00Z',
      updated_at: '2026-05-12T00:00:00Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fakeBatch), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { createBatch } = await import('./api');
    const result = await createBatch({
      name: 'Friday screenshots',
      state: 'Georgia',
      counties: ['DeKalb County'],
      scope_mode: 'county_wide',
    });

    expect(result).toEqual(fakeBatch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/batches');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        name: 'Friday screenshots',
        state: 'Georgia',
        counties: ['DeKalb County'],
        scope_mode: 'county_wide',
      }),
    );
    // Auth headers from getAuthHeaders() should be present.
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
    expect(headers['X-Org-Id']).toBe('org-123');
  });
});
