import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { readRecordedBundles } from '../helper-bundler.ts';

const BUNDLE = 'skills/demo/demo.mjs';

describe(readRecordedBundles, () => {
  it('reads the committed bytes of a tracked bundle', () => {
    const contentRoot = makeCommittedContentRoot({ [BUNDLE]: 'committed' });

    expect(readRecordedBundles(contentRoot).read(BUNDLE)?.toString('utf8')).toBe('committed');
  });

  it('reads what git records rather than what the working tree contains', () => {
    const contentRoot = makeCommittedContentRoot({ [BUNDLE]: 'committed' });
    writeFileSync(join(contentRoot, BUNDLE), 'rebuilt', 'utf8');

    expect(readRecordedBundles(contentRoot).read(BUNDLE)?.toString('utf8')).toBe('committed');
  });

  it('returns undefined for a bundle for which git records nothing', () => {
    const contentRoot = makeCommittedContentRoot({ [BUNDLE]: 'committed' });

    expect(readRecordedBundles(contentRoot).read('skills/absent/absent.mjs')).toBeUndefined();
  });

  it('omits a staged bundle that git does not record at HEAD', () => {
    const contentRoot = makeCommittedContentRoot({ [BUNDLE]: 'committed' });
    const staged = 'skills/staged/staged.mjs';
    mkdirSync(join(contentRoot, 'skills/staged'), { recursive: true });
    writeFileSync(join(contentRoot, staged), 'staged', 'utf8');
    execFileSync('git', ['-C', contentRoot, 'add', staged]);

    expect(readRecordedBundles(contentRoot).tracked).toEqual([BUNDLE]);
  });

  it('tracks every committed bundle under the content root, relative to it, and nothing else', () => {
    const contentRoot = makeCommittedContentRoot({
      [BUNDLE]: 'committed',
      'scripts/relay.mjs': 'relay',
      'skills/demo/SKILL.md': '# demo\n',
      '../src/demo/cli.mjs': 'outside the content root',
    });

    expect(readRecordedBundles(contentRoot).tracked).toEqual(['scripts/relay.mjs', BUNDLE]);
  });

  it('fails naming the content root when git does not have a commit to compare against', () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'recorded-bundles-'));
    onTestFinished(() => rmSync(contentRoot, { force: true, recursive: true }));
    execFileSync('git', ['-C', contentRoot, 'init', '--quiet']);

    expect(() => readRecordedBundles(contentRoot)).toThrow(
      `${contentRoot} is not inside a git work tree with a commit`,
    );
  });
});

// region | Helpers

/**
 * Creates a throwaway repository whose content root is at `packages/guidance/content`, commits `files` relative to that
 * root, and returns the root. The nesting exercises paths resolved against a root below the repository's top level.
 */
function makeCommittedContentRoot(files: Record<string, string>): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'recorded-bundles-'));
  onTestFinished(() => rmSync(repoRoot, { force: true, recursive: true }));
  execFileSync('git', ['-C', repoRoot, 'init', '--quiet']);

  const contentRoot = join(repoRoot, 'packages', 'guidance', 'content');
  mkdirSync(contentRoot, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(contentRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, 'utf8');
  }

  execFileSync('git', ['-C', repoRoot, 'add', '--all']);
  // The vitest git isolation nulls global config, so identity comes from the invocation.
  const identity = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test'];
  execFileSync('git', ['-C', repoRoot, ...identity, 'commit', '--quiet', '--message', 'add content']);

  return contentRoot;
}

// endregion | Helpers
