import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
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
    getSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-token', user: { id: 'user-123' } } }, error: null });

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
    expect(getSession).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce(new Response('still forbidden', { status: 403 })),
    );

    const { getMetricsSummary } = await import('./api');
    await expect(getMetricsSummary('today')).rejects.toMatchObject({
      message: 'We couldn’t verify your session. Sign in again.',
    });
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
});
