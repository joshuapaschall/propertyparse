import { beforeAll, describe, expect, it } from 'vitest';

describe('joinUrl', () => {
  beforeAll(() => {
    if (!import.meta.env.VITE_API_BASE_URL) {
      throw new Error('Test setup: VITE_API_BASE_URL must be set in vitest env');
    }
  });

  it('handles paths with leading slash', async () => {
    const { joinUrl } = await import('../joinUrl');
    const result = joinUrl('/jobs/123');
    expect(result.endsWith('/jobs/123')).toBe(true);
    expect(result).not.toContain('//jobs');
  });

  it('handles paths without leading slash', async () => {
    const { joinUrl } = await import('../joinUrl');
    const result = joinUrl('jobs/123');
    expect(result.endsWith('/jobs/123')).toBe(true);
  });

  it('produces an absolute URL', async () => {
    const { joinUrl } = await import('../joinUrl');
    const result = joinUrl('/test');
    expect(() => new URL(result)).not.toThrow();
  });
});
