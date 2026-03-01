import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.js';

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
});
