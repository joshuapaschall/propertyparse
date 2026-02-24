import { describe, expect, it } from 'vitest';
import { getSiteUrl } from '../siteUrl';

describe('getSiteUrl', () => {
  it('returns explicit VITE_SITE_URL without trailing slash', () => {
    expect(getSiteUrl('https://propertyparse.com/', 'http://localhost:5173')).toBe('https://propertyparse.com');
  });

  it('falls back to origin when VITE_SITE_URL is empty', () => {
    expect(getSiteUrl('   ', 'http://localhost:5173/')).toBe('http://localhost:5173');
  });
});
