import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { readCommits } from '../read-commits.ts';

const execFileAsync = promisify(execFile);

describe(readCommits, () => {
  it('reads a subject holding the delimiters the commit template itself uses', async () => {
    const cwd = await buildRepo(['agents|feat: Add a parser: the reader, the writer, and the verifier']);

    const commits = await readCommits({ baseRef: 'base', cwd });

    expect(commits).toHaveLength(1);
    expect(commits[0]?.subject).toBe('agents|feat: Add a parser: the reader, the writer, and the verifier');
    expect(commits[0]?.trailers).toStrictEqual([]);
  });

  it('reads a commit’s Change trailers, and reports none for a commit carrying none', async () => {
    const cwd = await buildRepo([
      'agents|refactor: Extract the reader',
      [
        'agents|fix: Squash the branch',
        '',
        'Change: agents|feat: Add the parser',
        'Change: agents|fix: Correct the guard',
      ].join('\n'),
    ]);

    const commits = await readCommits({ baseRef: 'base', cwd });
    const bySubject = new Map(commits.map((commit) => [commit.subject, commit.trailers]));

    expect(bySubject.get('agents|fix: Squash the branch')).toStrictEqual([
      'agents|feat: Add the parser',
      'agents|fix: Correct the guard',
    ]);
    expect(bySubject.get('agents|refactor: Extract the reader')).toStrictEqual([]);
  });

  it('reads a body whose trailer block follows several paragraphs', async () => {
    const message = [
      'agents|fix: Squash the branch',
      '',
      'A first paragraph reporting what the branch did.',
      '',
      'A second paragraph, so the trailer block is not the body’s only one.',
      '',
      'Change: agents|feat: Add the parser',
    ].join('\n');
    const cwd = await buildRepo([message]);

    const commits = await readCommits({ baseRef: 'base', cwd });

    expect(commits[0]?.trailers).toStrictEqual(['agents|feat: Add the parser']);
  });

  it('yields nothing for a range holding no commits', async () => {
    const cwd = await buildRepo([]);

    expect(await readCommits({ baseRef: 'base', cwd })).toStrictEqual([]);
  });

  it('reports commits oldest first, matching the order trailers are read in', async () => {
    const cwd = await buildRepo([
      'agents|feat: Add the parser',
      [
        'agents|fix: Squash the branch',
        '',
        'Change: agents|refactor: Extract the reader',
        'Change: agents|docs: Note it',
      ].join('\n'),
      'agents|fix: Correct the guard',
    ]);

    const commits = await readCommits({ baseRef: 'base', cwd });

    expect(commits.map((commit) => commit.subject)).toStrictEqual([
      'agents|feat: Add the parser',
      'agents|fix: Squash the branch',
      'agents|fix: Correct the guard',
    ]);
    expect(commits[1]?.trailers).toStrictEqual(['agents|refactor: Extract the reader', 'agents|docs: Note it']);
  });

  it('contributes nothing for a merge commit', async () => {
    const cwd = await buildRepo(['agents|feat: Add the parser']);
    await execFileAsync('git', ['-C', cwd, 'checkout', '--quiet', '-b', 'side', 'base']);
    await writeFile(join(cwd, 'side.txt'), 'side\n', 'utf8');
    await commitAll(cwd, 'agents|fix: Correct the guard');
    await execFileAsync('git', ['-C', cwd, 'checkout', '--quiet', '-']);
    await execFileAsync('git', ['-C', cwd, 'merge', '--no-ff', '--no-gpg-sign', '--quiet', '-m', 'Merge side', 'side']);

    const commits = await readCommits({ baseRef: 'base', cwd });

    // Two branches committed in the same second have no stable order between them, so this fixes membership alone;
    // the linear-history case above fixes the order.
    expect(commits.map((commit) => commit.subject).toSorted()).toStrictEqual([
      'agents|feat: Add the parser',
      'agents|fix: Correct the guard',
    ]);
  });
});

// region | Helpers

/**
 * Builds a repository holding one commit per message, tagged `base` before the first, and returns its path. Every
 * commit is made under a scratch directory, never in the repository under development.
 */
async function buildRepo(messages: readonly string[]): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'read-commits-'));
  await execFileAsync('git', ['-C', cwd, 'init', '--quiet']);
  await execFileAsync('git', ['-C', cwd, 'config', 'user.email', 'test@example.com']);
  await execFileAsync('git', ['-C', cwd, 'config', 'user.name', 'Test']);

  await writeFile(join(cwd, 'seed.txt'), 'seed\n', 'utf8');
  await commitAll(cwd, 'seed');
  await execFileAsync('git', ['-C', cwd, 'tag', 'base']);

  for (const [index, message] of messages.entries()) {
    await writeFile(join(cwd, `file${index}.txt`), `${index}\n`, 'utf8');
    await commitAll(cwd, message);
  }
  return cwd;
}

/** Stages everything in `cwd` and records it under `message`, bypassing the hooks and signing a fixture cannot supply. */
async function commitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync('git', ['-C', cwd, 'add', '--all']);
  await execFileAsync('git', ['-C', cwd, 'commit', '--message', message, '--no-gpg-sign', '--no-verify', '--quiet']);
}

// endregion | Helpers
