import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import { realGit } from '../git.ts';
import { pinSources } from '../pin.ts';

const GITHUB_URL = 'https://github.com/acme/guide.git';
const QUOTE = 'Headings use sentence case.';

describe(pinSources, () => {
  let base: string;
  let guide: string;
  let sha: string;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(path.join(tmpdir(), 'curate-pin-')));
    ({ guide, sha } = await makeGuideClone(base));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('pins two source directories of one GitHub repository at its default branch, sharing one pin', async () => {
    const result = await pinSources([path.join(guide, 'content'), path.join(guide, 'rules')], realGit);

    expect(result.skipped).toStrictEqual([]);
    expect(result.pins).toStrictEqual([
      {
        repo: 'acme/guide',
        root: guide,
        branch: 'main',
        sha,
        sources: [path.join(guide, 'content'), path.join(guide, 'rules')],
      },
    ]);
  });

  it('gives a second worktree of the same repository the first worktree pin', async () => {
    const worktree = path.join(base, 'guide.live');
    git(guide, 'worktree', 'add', '--quiet', '--detach', worktree);

    const result = await pinSources([guide, worktree], realGit);

    expect(result.pins).toHaveLength(1);
    expect(result.pins[0]).toMatchObject({ root: guide, sources: [guide, worktree] });
  });

  it('resolves the default branch from the remote when origin/HEAD is not set locally', async () => {
    git(guide, 'remote', 'set-head', 'origin', '--delete');

    const result = await pinSources([guide], realGit);

    expect(result.pins[0]?.branch).toBe('main');
  });

  it('skips a directory outside any repository and a repository whose origin is not on GitHub', async () => {
    const outside = path.join(base, 'outside');
    await mkdir(outside);
    const local = path.join(base, 'local');
    await mkdir(local);
    git(local, 'init', '--quiet');
    git(local, 'remote', 'add', 'origin', path.join(base, 'origin.git'));

    const result = await pinSources([outside, local], realGit);

    expect(result.pins).toStrictEqual([]);
    expect(result.skipped.map((entry) => entry.reason)).toStrictEqual([
      'not in a git repository',
      `the origin of ${local} is not on GitHub (${path.join(base, 'origin.git')})`,
    ]);
  });
});

describe('validate against a pinned repository', () => {
  it('accepts a covered quote that the file contains at the pin, and rejects an absent path or quote', async () => {
    const base = await realpath(await mkdtemp(path.join(tmpdir(), 'curate-validate-')));
    try {
      const { guide, sha } = await makeGuideClone(base);
      const work = path.join(base, 'work');
      await mkdir(work);
      const pin = { repo: 'acme/guide', root: guide, branch: 'main', sha, sources: [guide] };
      const assignment = {
        store: 'fixture',
        clusters: [
          {
            id: 'one',
            lesson: 'One.',
            events: [
              { id: '01A', summary: 'A', excerpt: '' },
              { id: '01B', summary: 'B', excerpt: '' },
              { id: '01C', summary: 'C', excerpt: '' },
            ],
          },
        ],
        references: [],
        pins: [pin],
      };
      await writeFile(path.join(work, 'assignment-01.json'), JSON.stringify(assignment), 'utf8');
      const bins = {
        events: [
          { id: '01A', bin: 'covered', source: 'acme/guide', path: 'rules/headings.md', quote: QUOTE, reason: 'It.' },
          { id: '01B', bin: 'covered', source: 'acme/guide', path: 'rules/missing.md', quote: QUOTE, reason: 'It.' },
          {
            id: '01C',
            bin: 'covered',
            source: 'acme/guide',
            path: 'rules/headings.md',
            quote: 'Use title case.',
            reason: 'It.',
          },
        ],
      };
      await writeFile(path.join(work, 'bins-01.json'), JSON.stringify(bins), 'utf8');

      const result = await runCli(['validate', '--assignments', work, '--out', path.join(work, 'record.json')], {
        cwd: work,
      });

      expect(result).toMatchObject({
        ok: false,
        error: 'invalid-bins',
        violations: [
          { event: '01B', message: `rules/missing.md does not exist in acme/guide at ${sha}` },
          { event: '01C', message: `the quote does not appear in rules/headings.md in acme/guide at ${sha}` },
        ],
      });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

// region | Helpers

/** Runs git in `cwd` and returns its trimmed stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

/**
 * Creates a bare origin with one commit on `main` and a clone of it whose `origin` reads as a GitHub URL, which
 * `insteadOf` maps back to the bare repository so that fetching still works offline.
 */
async function makeGuideClone(base: string): Promise<{ guide: string; sha: string }> {
  const origin = path.join(base, 'origin.git');
  const seed = path.join(base, 'seed');
  const guide = path.join(base, 'guide');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin]);
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', seed]);
  await mkdir(path.join(seed, 'rules'));
  await mkdir(path.join(seed, 'content'));
  await writeFile(path.join(seed, 'rules', 'headings.md'), 'Headings use **sentence\ncase**.\n', 'utf8');
  await writeFile(path.join(seed, 'content', 'index.md'), 'Index.\n', 'utf8');
  git(seed, 'add', '.');
  git(seed, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--quiet', '--message', 'Seed');
  git(seed, 'push', '--quiet', origin, 'main');
  execFileSync('git', ['clone', '--quiet', origin, guide]);
  git(guide, 'config', 'remote.origin.url', GITHUB_URL);
  git(guide, 'config', `url.${origin}.insteadOf`, GITHUB_URL);
  return { guide, sha: git(guide, 'rev-parse', 'origin/main') };
}

// endregion | Helpers
