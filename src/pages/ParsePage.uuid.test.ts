import { describe, it, expect } from 'vitest';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('UUID_RE validation', () => {
  it('accepts a valid v4 UUID', () => {
    expect(UUID_RE.test('ec2e2d44-14d0-451f-bab5-2977fec606b6')).toBe(true);
  });

  it('rejects a 35-char truncated UUID', () => {
    expect(UUID_RE.test('ec2e2d44-14d0-451f-bab5-2977fec606b')).toBe(false);
  });

  it('rejects garbage', () => {
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(UUID_RE.test('')).toBe(false);
  });

  it('accepts uppercase UUIDs', () => {
    expect(UUID_RE.test('EC2E2D44-14D0-451F-BAB5-2977FEC606B6')).toBe(true);
  });
});
