import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { readRecordedBundles } from '../bundle-skill-helpers.ts';

const BUNDLE = 'content/skills/demo/demo.mjs';

describe(readRecordedBundles, () => {
  it('reads the committed bytes of a tracked bundle', () => {
    const packageDir = makeCommittedPackage({ [BUNDLE]: 'committed' });

    expect(readRecordedBundles(packageDir).read(BUNDLE)?.toString('utf8')).toBe('committed');
  });

  it('reads what git records rather than what the working tree holds', () => {
    const packageDir = makeCommittedPackage({ [BUNDLE]: 'committed' });
    writeFileSync(join(packageDir, BUNDLE), 'rebuilt', 'utf8');

    expect(readRecordedBundles(packageDir).read(BUNDLE)?.toString('utf8')).toBe('committed');
  });

  it('returns undefined for a bundle git records nothing for', () => {
    const packageDir = makeCommittedPackage({ [BUNDLE]: 'committed' });

    expect(readRecordedBundles(packageDir).read('content/skills/absent/absent.mjs')).toBeUndefined();
  });

  it('omits a staged bundle that no commit records', () => {
    const packageDir = makeCommittedPackage({ [BUNDLE]: 'committed' });
    const staged = 'content/skills/staged/staged.mjs';
    mkdirSync(join(packageDir, 'content/skills/staged'), { recursive: true });
    writeFileSync(join(packageDir, staged), 'staged', 'utf8');
    execFileSync('git', ['-C', packageDir, 'add', staged]);

    expect(readRecordedBundles(packageDir).tracked).toEqual([BUNDLE]);
  });

  it('tracks every committed bundle under content and nothing else', () => {
    const packageDir = makeCommittedPackage({
      [BUNDLE]: 'committed',
      'content/scripts/relay.mjs': 'relay',
      'content/skills/demo/SKILL.md': '# demo\n',
      'src/demo/cli.ts': 'export {};\n',
    });

    expect(readRecordedBundles(packageDir).tracked).toEqual(['content/scripts/relay.mjs', BUNDLE]);
  });
});

// region | Helpers

/**
 * Creates a throwaway repository whose package sits at `packages/agents`, commits `files` under it, and returns the
 * package directory. The nesting is what exercises the repository-relative prefix a blob path needs.
 */
function makeCommittedPackage(files: Record<string, string>): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'recorded-bundles-'));
  onTestFinished(() => rmSync(repoRoot, { force: true, recursive: true }));
  execFileSync('git', ['-C', repoRoot, 'init', '--quiet']);

  const packageDir = join(repoRoot, 'packages', 'agents');
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(packageDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, 'utf8');
  }

  execFileSync('git', ['-C', repoRoot, 'add', '--all']);
  // The vitest git isolation nulls global config, so identity comes from the invocation.
  const identity = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test'];
  execFileSync('git', ['-C', repoRoot, ...identity, 'commit', '--quiet', '--message', 'add package']);

  return packageDir;
}

// endregion | Helpers
