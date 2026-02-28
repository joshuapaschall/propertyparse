import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('API error handling', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');

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
      expect(info?.endpoint).toBe('/jobs/job-123/ai-fix-flagged');
      return;
    }

    throw new Error('Expected runAiFixFlaggedRows to throw');
  });
});
