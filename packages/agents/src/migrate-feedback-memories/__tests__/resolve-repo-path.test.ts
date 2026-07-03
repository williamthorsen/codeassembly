import { describe, expect, it } from 'vitest';

import { resolveRepoPath } from '../resolve-repo-path.ts';

/** Builds an `isDirectory` probe backed by a fixed set of existing directory paths, so the search runs against a
 * fixture instead of the real filesystem. */
function makeDirectoryProbe(dirs: readonly string[]): (path: string) => Promise<boolean> {
  const existing = new Set(dirs);
  return (path) => Promise.resolve(existing.has(path));
}

describe(resolveRepoPath, () => {
  it('resolves a slug whose every segment is its own directory', async () => {
    const isDirectory = makeDirectoryProbe([
      '/Users',
      '/Users/william',
      '/Users/william/repos',
      '/Users/william/repos/projects',
      '/Users/william/repos/projects/codeassembly',
    ]);

    const resolved = await resolveRepoPath('-Users-william-repos-projects-codeassembly', isDirectory);

    expect(resolved).toBe('/Users/william/repos/projects/codeassembly');
  });

  it('reassembles a leaf directory name that itself contains dashes', async () => {
    const isDirectory = makeDirectoryProbe([
      '/Users',
      '/Users/william',
      '/Users/william/repos',
      '/Users/william/repos/projects',
      '/Users/william/repos/projects/node-monorepo-tools',
    ]);

    const resolved = await resolveRepoPath('-Users-william-repos-projects-node-monorepo-tools', isDirectory);

    expect(resolved).toBe('/Users/william/repos/projects/node-monorepo-tools');
  });

  it('backtracks past a shorter directory that exists but cannot resolve the remainder', async () => {
    // `/repos/node` exists but leads nowhere; the real repo is the dashed `/repos/node-tools`.
    const isDirectory = makeDirectoryProbe(['/repos', '/repos/node', '/repos/node-tools']);

    const resolved = await resolveRepoPath('-repos-node-tools', isDirectory);

    expect(resolved).toBe('/repos/node-tools');
  });

  it('returns null when the slug maps to no existing directory', async () => {
    const isDirectory = makeDirectoryProbe(['/Users', '/Users/william']);

    const resolved = await resolveRepoPath('-Users-someone-else-project', isDirectory);

    expect(resolved).toBeNull();
  });

  it('returns null when only a prefix resolves and segments remain unconsumed', async () => {
    const isDirectory = makeDirectoryProbe(['/Users', '/Users/william', '/Users/william/repos']);

    const resolved = await resolveRepoPath('-Users-william-repos-projects-codeassembly', isDirectory);

    expect(resolved).toBeNull();
  });
});
