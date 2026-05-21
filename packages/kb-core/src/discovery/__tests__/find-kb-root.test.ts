import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findKbRoot } from '../find-kb-root.ts';

const NESTED_PROJECT = join(import.meta.dirname, 'fixtures', 'nested-project');

describe(findKbRoot, () => {
  it('finds the .kb root when started from the root directory itself', async () => {
    const root = await findKbRoot({ startDir: NESTED_PROJECT });

    expect(root).toEqual({
      path: NESTED_PROJECT,
      kbDir: join(NESTED_PROJECT, '.kb'),
      via: 'ancestor-walk',
    });
  });

  it('finds the .kb root when started from a deeply nested descendant', async () => {
    const root = await findKbRoot({ startDir: join(NESTED_PROJECT, 'a', 'b', 'c') });

    expect(root?.path).toBe(NESTED_PROJECT);
  });

  it('finds the .kb root when started one level below the root', async () => {
    const root = await findKbRoot({ startDir: join(NESTED_PROJECT, 'a') });

    expect(root?.path).toBe(NESTED_PROJECT);
  });

  it('returns null when no ancestor contains a .kb directory', async () => {
    const root = await findKbRoot({ startDir: '/' });

    expect(root).toBeNull();
  });
});
