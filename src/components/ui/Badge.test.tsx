import { describe, expect, it } from 'vitest';
import { getBadgeVariant } from './badgeVariant';

describe('getBadgeVariant', () => {
  it('maps OUT_OF_SCOPE_MARKER to out_of_scope variant', () => {
    expect(getBadgeVariant('OUT_OF_SCOPE_MARKER')).toBe('out_of_scope');
  });
});
