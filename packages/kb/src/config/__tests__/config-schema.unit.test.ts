import { describe, expect, it } from 'vitest';

import { isAtLeastAsShareable } from '../config-schema.ts';

describe(isAtLeastAsShareable, () => {
  it('permits a link from a private store into a shared one', () => {
    expect(isAtLeastAsShareable({ source: 'private', target: 'shared' })).toBe(true);
  });

  it('refuses a link from a shared store into a private one', () => {
    expect(isAtLeastAsShareable({ source: 'shared', target: 'private' })).toBe(false);
  });

  it('permits a link between stores of equal visibility', () => {
    expect(isAtLeastAsShareable({ source: 'private', target: 'private' })).toBe(true);
    expect(isAtLeastAsShareable({ source: 'shared', target: 'shared' })).toBe(true);
  });
});
