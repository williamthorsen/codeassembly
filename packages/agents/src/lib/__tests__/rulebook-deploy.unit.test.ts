import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SourceResolver } from '../content-sources.ts';
import { resolveRulebook } from '../rulebook-deploy.ts';

const ABSENT_DIR = path.join(tmpdir(), 'rulebook-deploy-absent-source');

describe(resolveRulebook, () => {
  it('names the origin and the path when the resolved source carries no rulebook file', async () => {
    await expect(resolveRulebook('ghost', buildAlwaysResolvingResolver(ABSENT_DIR))).rejects.toThrow(
      /Declared rulebook "ghost" was not found in the library/,
    );
  });

  it('attaches the read failure as the cause', async () => {
    await expect(resolveRulebook('ghost', buildAlwaysResolvingResolver(ABSENT_DIR))).rejects.toHaveProperty(
      'cause',
      expect.any(Error),
    );
  });
});

// region | Helpers

/**
 * Builds a resolver that reports every slug as resolving under `dir` without probing for the file. This is the
 * only way to reach the read failure: the real resolver resolves by existence, so it never hands back a directory
 * whose frontmatter file is missing.
 */
function buildAlwaysResolvingResolver(dir: string): SourceResolver {
  return {
    libraryDir: dir,
    sources: [],
    resolve: () => Promise.resolve({ dir, source: undefined }),
  };
}

// endregion | Helpers
