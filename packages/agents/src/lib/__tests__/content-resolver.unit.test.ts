import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.ts';

describe('resolveContentDir', () => {
  it('should resolve to a directory that exists', () => {
    const contentDir = resolveContentDir();
    expect(contentDir).toMatch(/content$/);
  });

  it('should resolve to a directory containing skills and subagents', async () => {
    const { existsSync } = await import('node:fs');
    const contentDir = resolveContentDir();

    expect(existsSync(path.join(contentDir, 'skills'))).toBe(true);
    expect(existsSync(path.join(contentDir, 'subagents'))).toBe(true);
  });

  it('includes `skills/_data/work-types.json` so the install sweep ships it', async () => {
    // The install command copies the resolved content directory wholesale; no install-code change
    // is needed for new `_data/` files. This test anchors that guarantee for `work-types.json`,
    // which downstream changelog/release-notes tooling relies on.
    const { existsSync } = await import('node:fs');
    const contentDir = resolveContentDir();

    expect(existsSync(path.join(contentDir, 'skills', '_data', 'work-types.json'))).toBe(true);
  });
});
