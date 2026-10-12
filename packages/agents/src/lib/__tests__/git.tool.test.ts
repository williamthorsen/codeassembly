import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realGit } from '../git.ts';

const execFileAsync = promisify(execFile);

describe('realGit', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'agents-git-')));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('checkIgnored', () => {
    it('reports an ignored path as ignored', async () => {
      await initRepo(scratch, '*.local.*\n');
      const target = path.join(scratch, 'CLAUDE.local.md');
      await writeFile(target, '# Notes\n', 'utf8');

      expect(await realGit.checkIgnored(scratch, target)).toBe(true);
    });

    it('reports a path not covered by any rule as not ignored', async () => {
      await initRepo(scratch, 'node_modules/\n');
      const target = path.join(scratch, 'CLAUDE.local.md');
      await writeFile(target, '# Notes\n', 'utf8');

      expect(await realGit.checkIgnored(scratch, target)).toBe(false);
    });

    it('answers for a path that does not exist yet, so that a caller can check before writing', async () => {
      await initRepo(scratch, '*.local.*\n');

      expect(await realGit.checkIgnored(scratch, path.join(scratch, 'CLAUDE.local.md'))).toBe(true);
      expect(await realGit.checkIgnored(scratch, path.join(scratch, 'CLAUDE.md'))).toBe(false);
    });

    it('returns undefined outside a repository, distinguishing "cannot answer" from "not ignored"', async () => {
      expect(await realGit.checkIgnored(scratch, path.join(scratch, 'CLAUDE.local.md'))).toBeUndefined();
    });
  });

  describe('findTopLevel', () => {
    it('resolves the working tree root from a subdirectory of it', async () => {
      await initRepo(scratch);
      const nested = path.join(scratch, 'a', 'b');
      await mkdir(nested, { recursive: true });

      expect(await realGit.findTopLevel(nested)).toBe(scratch);
    });

    it('answers with nothing for a directory in no repository', async () => {
      expect(await realGit.findTopLevel(scratch)).toBeUndefined();
    });

    it('answers with nothing for a directory that does not exist', async () => {
      expect(await realGit.findTopLevel(path.join(scratch, 'missing'))).toBeUndefined();
    });
  });

  describe('HEAD reads', () => {
    const BUNDLE = 'skills/demo/demo.mjs';

    it('reads the committed bytes of a file rather than what the working tree contains', async () => {
      const contentRoot = await commitContentRoot(scratch, { [BUNDLE]: 'committed' });
      await writeFile(path.join(contentRoot, BUNDLE), 'rebuilt', 'utf8');

      expect(realGit.hasHeadCommit(contentRoot)).toBe(true);
      expect(realGit.readHeadBlob(contentRoot, BUNDLE)?.toString('utf8')).toBe('committed');
    });

    it('returns undefined for a file that HEAD does not record', async () => {
      const contentRoot = await commitContentRoot(scratch, { [BUNDLE]: 'committed' });

      expect(realGit.readHeadBlob(contentRoot, 'skills/absent/absent.mjs')).toBeUndefined();
    });

    it('lists the files that HEAD records under the directory, relative to it, omitting staged ones', async () => {
      const contentRoot = await commitContentRoot(scratch, {
        [BUNDLE]: 'committed',
        'skills/demo/SKILL.md': '# demo\n',
        '../src/cli.mjs': 'outside the content root',
      });
      await writeFile(path.join(contentRoot, 'staged.mjs'), 'staged', 'utf8');
      await git(contentRoot, ['add', 'staged.mjs']);

      expect(realGit.listHeadFiles(contentRoot)).toEqual(['skills/demo/SKILL.md', BUNDLE]);
    });

    it('reports that a repository without a commit has no HEAD commit, and throws on listing it', async () => {
      await initRepo(scratch);

      expect(realGit.hasHeadCommit(scratch)).toBe(false);
      expect(() => realGit.listHeadFiles(scratch)).toThrow();
    });
  });

  describe('readHeadCommit', () => {
    it('reads the commit that HEAD is on', async () => {
      await initRepo(scratch);
      await commitAll(scratch, 'initial');

      expect(await realGit.readHeadCommit(scratch)).toBe(await git(scratch, ['rev-parse', 'HEAD']));
    });

    it('answers with nothing outside a repository', async () => {
      expect(await realGit.readHeadCommit(scratch)).toBeUndefined();
    });
  });

  describe('remotes', () => {
    it('lists the remotes and reads each fetch URL', async () => {
      await initRepo(scratch);
      await git(scratch, ['remote', 'add', 'upstream', 'https://github.com/acme/upstream.git']);
      await git(scratch, ['remote', 'add', 'origin', 'git@github.com:acme/origin.git']);

      expect(await realGit.listRemotes(scratch)).toEqual(['origin', 'upstream']);
      expect(await realGit.readRemoteUrl(scratch, 'origin')).toBe('git@github.com:acme/origin.git');
    });

    it('lists no remotes for a repository without any', async () => {
      await initRepo(scratch);

      expect(await realGit.listRemotes(scratch)).toEqual([]);
    });

    it('throws outside a repository', async () => {
      await expect(realGit.listRemotes(scratch)).rejects.toThrow();
    });
  });

  describe('ancestry queries', () => {
    let sourceRoot: string;

    beforeEach(async () => {
      sourceRoot = path.join(scratch, 'source');
      await mkdir(sourceRoot);
      await initRepo(sourceRoot);
      await commitAll(sourceRoot, 'initial');
      await git(sourceRoot, ['remote', 'add', 'origin', sourceRoot]);
      await git(sourceRoot, ['fetch', '--quiet', 'origin']);
      await git(sourceRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
    });

    it('reads the ref to which origin/HEAD points, and nothing once it is unset', async () => {
      expect(await realGit.readSymbolicRef(sourceRoot, 'origin/HEAD')).toBe('origin/main');

      await git(sourceRoot, ['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD']);

      expect(await realGit.readSymbolicRef(sourceRoot, 'origin/HEAD')).toBeUndefined();
    });

    it('verifies a ref that resolves and rejects one that does not', async () => {
      expect(await realGit.verifyRef(sourceRoot, 'origin/main')).toBe(true);
      expect(await realGit.verifyRef(sourceRoot, 'origin/trunk')).toBe(false);
      expect(await realGit.verifyRef(scratch, 'origin/main')).toBe(false);
    });

    it('reports a commit on the default branch as its ancestor, and an unmerged one as not', async () => {
      expect(await realGit.isAncestor(sourceRoot, 'HEAD', 'origin/main')).toBe(true);

      await git(sourceRoot, ['checkout', '--quiet', '-b', 'feature']);
      await writeFile(path.join(sourceRoot, 'feature.txt'), 'unmerged\n', 'utf8');
      await commitAll(sourceRoot, 'unmerged work');

      expect(await realGit.isAncestor(sourceRoot, 'HEAD', 'origin/main')).toBe(false);
    });

    it('reports no ancestry outside a repository', async () => {
      expect(await realGit.isAncestor(scratch, 'HEAD', 'origin/main')).toBe(false);
    });
  });
});

// region | Helpers

/** Commits every file in the repository, supplying the identity and signing settings that git config may withhold. */
async function commitAll(cwd: string, message: string): Promise<void> {
  await writeFile(path.join(cwd, 'file.txt'), `${message}\n`, 'utf8');
  await git(cwd, ['add', '--all']);
  await git(cwd, [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--message',
    message,
  ]);
}

/** Commits `files`, given relative to a `content` directory, into a repository at `scratch`; returns that directory. */
async function commitContentRoot(scratch: string, files: Record<string, string>): Promise<string> {
  await initRepo(scratch);
  const contentRoot = path.join(scratch, 'content');
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(contentRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
  }
  await commitAll(scratch, 'add content');
  return contentRoot;
}

/** Runs one git command in a scratch tree, returning its trimmed stdout. */
async function git(cwd: string, args: ReadonlyArray<string>): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args]);
  return stdout.trim();
}

/** Makes `cwd` a repository on `main`, with `ignoreRules` as its `.gitignore` when given. */
async function initRepo(cwd: string, ignoreRules?: string): Promise<void> {
  await git(cwd, ['init', '--quiet', '--initial-branch', 'main']);
  if (ignoreRules !== undefined) {
    await writeFile(path.join(cwd, '.gitignore'), ignoreRules, 'utf8');
  }
}

// endregion | Helpers
