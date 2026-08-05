import { describe, expect, it } from 'vitest';

import { deriveLabel } from '../derive-label.ts';

describe(deriveLabel, () => {
  it('uses the resolved repo directory basename when a repo path is present', () => {
    expect(deriveLabel('/Users/me/repos/my-app', '-Users-me-repos-my-app')).toBe('my-app');
  });

  it('falls back to the memory-store slug when there is no live repo', () => {
    expect(deriveLabel(null, '-store-a')).toBe('-store-a');
  });
});
