import { describe, it, expect } from 'vitest';

describe('Dashboard batch imports', () => {
  it('getBatches is available', async () => {
    const api = await import('../lib/api');
    expect(typeof api.getBatches).toBe('function');
  });
});
