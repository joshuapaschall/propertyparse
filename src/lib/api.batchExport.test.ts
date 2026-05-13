import { describe, expect, it } from 'vitest';

describe('downloadBatchExport', () => {
  it('is exported from api module', async () => {
    const api = await import('./api');
    expect(typeof api.downloadBatchExport).toBe('function');
  });
});
