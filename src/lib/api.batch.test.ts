import { describe, it, expect } from 'vitest';

describe('batch API types', () => {
  it('getBatches is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatches).toBe('function');
  });

  it('getBatchRollup is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatchRollup).toBe('function');
  });

  it('getBatchJobs is exported', async () => {
    const api = await import('./api');
    expect(typeof api.getBatchJobs).toBe('function');
  });
});
