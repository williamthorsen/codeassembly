import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realGit } from '../git.ts';

const GUIDE = 'docs/guide.md';

describe('realGit', () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-git-')));
    git('init', '--quiet');
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  describe('findTopLevel', () => {
    it('returns the top level from a subdirectory', async () => {
      await mkdir(path.join(repository, 'docs'));

      expect(realGit.findTopLevel(path.join(repository, 'docs'))).toBe(repository);
    });

    it('returns undefined outside any repository', async () => {
      const outside = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-git-outside-')));
      try {
        expect(realGit.findTopLevel(outside)).toBeUndefined();
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await writeFiles({
        '.gitignore': 'ignored.md\n',
        'docs/tracked.md': 'Tracked.\n',
        'lib/codeassembly-content.yaml': 'format: 2\n',
      });
      git('add', '--all');
      commit('seed');
      await writeFiles({ 'docs/untracked.md': 'Untracked.\n', 'ignored.md': 'Ignored.\n' });
    });

    it('lists tracked and untracked files, excluding ignored ones', () => {
      expect(realGit.listFiles(repository, []).toSorted()).toStrictEqual([
        '.gitignore',
        'docs/tracked.md',
        'docs/untracked.md',
        'lib/codeassembly-content.yaml',
      ]);
    });

    it('honors a directory pathspec', () => {
      expect(realGit.listFiles(repository, ['docs']).toSorted()).toStrictEqual([
        'docs/tracked.md',
        'docs/untracked.md',
      ]);
    });

    it('honors a `*name` pathspec at any depth', () => {
      expect(realGit.listFiles(repository, ['*codeassembly-content.yaml'])).toStrictEqual([
        'lib/codeassembly-content.yaml',
      ]);
    });
  });

  describe('listChangedFiles', () => {
    beforeEach(async () => {
      await writeFiles({ 'clean.md': 'Clean.\n', 'modified.md': 'Before.\n', 'original.md': 'Moved.\n' });
      git('add', '--all');
      commit('seed');
    });

    it('reports a modified file, an untracked file, and the destination of a staged rename', async () => {
      await writeFiles({ 'modified.md': 'After.\n', 'untracked.md': 'Untracked.\n' });
      git('mv', 'original.md', 'renamed.md');

      const changed = realGit.listChangedFiles(repository, [
        'clean.md',
        'modified.md',
        'original.md',
        'renamed.md',
        'untracked.md',
      ]);

      expect([...changed].toSorted()).toStrictEqual(['modified.md', 'renamed.md', 'untracked.md']);
    });

    it('returns an empty set when given an empty list of files', async () => {
      await writeFiles({ 'modified.md': 'After.\n' });

      expect(realGit.listChangedFiles(repository, [])).toStrictEqual(new Set());
    });
  });

  describe('findPhraseHistory', () => {
    it("lists the commits that changed a phrase's occurrence in its file, newest first", async () => {
      const phrase = 'Keep the reinforcement at the output step.';
      await commitFile(GUIDE, `# Guide\n\n${phrase}\n`, 'Add the guide');
      await commitFile(GUIDE, '# Guide\n', 'Remove the reinforcement');
      await commitFile(GUIDE, '# Guide\n\nAn unrelated line.\n', 'Add an unrelated line');
      await commitFile(GUIDE, `# Guide\n\nAn unrelated line.\n\n${phrase}\n`, 'Restore the reinforcement');

      const history = realGit.findPhraseHistory(repository, GUIDE, phrase);

      expect(history.map((commit) => commit.subject)).toStrictEqual([
        'Restore the reinforcement',
        'Remove the reinforcement',
        'Add the guide',
      ]);
      expect(history[0]).toMatchObject({ sha: expect.stringMatching(/^[0-9a-f]{40}$/), body: '' });
    });

    it('finds the history of a phrase containing quotes, backticks, and a command substitution', async () => {
      const phrase = 'Run `nmr fmt` and don\'t "skip" it: $(date).';
      await commitFile(GUIDE, `${phrase}\n`, 'Add the formatting rule');

      const history = realGit.findPhraseHistory(repository, GUIDE, phrase);

      expect(history.map((commit) => commit.subject)).toStrictEqual(['Add the formatting rule']);
    });
  });

  /** Commits the staged changes under the given subject, with automatic maintenance disabled. */
  function commit(subject: string): void {
    git(
      '-c',
      'maintenance.auto=false',
      '-c',
      'gc.auto=0',
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--message',
      subject,
    );
  }

  /** Writes a file and commits it alone under the given subject. */
  async function commitFile(file: string, content: string, subject: string): Promise<void> {
    await writeFiles({ [file]: content });
    git('add', file);
    commit(subject);
  }

  /** Runs git in the repository. */
  function git(...args: string[]): void {
    execFileSync('git', ['-C', repository, ...args]);
  }

  /** Writes each file beneath the repository, creating its directories. */
  async function writeFiles(files: Readonly<Record<string, string>>): Promise<void> {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
      await writeFile(path.join(repository, file), content, 'utf8');
    }
  }
});
