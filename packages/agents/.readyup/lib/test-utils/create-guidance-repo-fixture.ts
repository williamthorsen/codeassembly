import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** A temporary git repository a staleness test commits into. */
export interface GuidanceRepoFixture {
  /** Repository root, holding everything the fixture created. */
  root: string;
  /** Commits the named files, creating each with throwaway content. */
  commitFiles: (...relativePaths: ReadonlyArray<string>) => Promise<void>;
}

/**
 * Builds an empty temporary git repository with an identity of its own, so the commits a test makes need
 * neither the developer's git config nor a writable global one.
 */
export async function createGuidanceRepoFixture(): Promise<GuidanceRepoFixture> {
  const root = await mkdtemp(join(tmpdir(), 'guidance-staleness-'));
  await runGit(root, 'init', '--quiet', '--initial-branch=main');
  await runGit(root, 'config', 'user.email', 'fixture@example.com');
  await runGit(root, 'config', 'user.name', 'Fixture');

  let commitCount = 0;
  async function commitFiles(...relativePaths: ReadonlyArray<string>): Promise<void> {
    commitCount += 1;
    for (const relativePath of relativePaths) {
      await writeFile(join(root, relativePath), `revision ${commitCount}\n`, 'utf8');
    }
    await runGit(root, 'add', '--all');
    await runGit(root, 'commit', '--quiet', '--message', `commit ${commitCount}`);
  }

  return { commitFiles, root };
}

// region | Helpers

/** Runs one git command in the fixture repository. */
async function runGit(repoPath: string, ...args: ReadonlyArray<string>): Promise<void> {
  await execFileAsync('git', ['-C', repoPath, ...args]);
}

// endregion | Helpers
