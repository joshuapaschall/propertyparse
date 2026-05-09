import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureFreshSessionMock = vi.fn().mockResolvedValue({ accessToken: 'tok2' });

vi.mock('./authState', () => ({
  getAuthHeaderState: () => ({ accessToken: 'tok', orgId: 'org', userId: 'usr' }),
}));
vi.mock('./sessionRefresh', () => ({
  ensureFreshSession: ensureFreshSessionMock,
  AUTH_FAILURE_MESSAGE: 'auth-failure',
}));

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');

describe('locationApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ensureFreshSessionMock.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches successful responses and returns the cached value on repeat calls (B66)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: ['Georgia'] }), text: async () => '' });
    const { searchStates } = await import('./locationApi');
    const r1 = await searchStates('ga');
    const r2 = await searchStates('ga');
    expect(r1).toEqual(['Georgia']);
    expect(r2).toEqual(['Georgia']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes AbortSignal through to fetch (B67)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: ['Georgia'] }), text: async () => '' });
    const { searchStates } = await import('./locationApi');
    const controller = new AbortController();
    await searchStates('ga', 100, controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('throws AbortError synchronously if signal is already aborted (B67)', async () => {
    const { searchStates } = await import('./locationApi');
    const controller = new AbortController();
    controller.abort();
    await expect(searchStates('ga', 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries once on 401 after refreshing the session (B68)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: ['Georgia'] }), text: async () => '' });
    const { searchStates } = await import('./locationApi');
    const result = await searchStates('ga');
    expect(result).toEqual(['Georgia']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureFreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry the request if the second call also returns 401 (B68)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => 'still unauthorized' });
    const { searchStates } = await import('./locationApi');
    await expect(searchStates('ga')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entries when the cache exceeds the max size (B66)', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ items: ['x'] }), text: async () => '' }));
    const { searchStates } = await import('./locationApi');
    for (let i = 0; i < 257; i++) await searchStates(`q${i}`);
    const callsBefore = fetchMock.mock.calls.length;
    await searchStates('q0');
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });
});
