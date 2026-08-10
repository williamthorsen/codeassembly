import { describe, expect, it } from 'vitest';

import { KbLoaderError } from '../kb-loader-error.ts';

describe(KbLoaderError, () => {
  it('exposes a cause passed through its options', () => {
    const cause = new Error('underlying');

    const error = new KbLoaderError('wrapped', { cause });

    expect(error.cause).toBe(cause);
  });
});
