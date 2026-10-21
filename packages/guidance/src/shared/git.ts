/** The git adapter for the shared helpers: every git invocation that they make, with its parsing. */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '../lib/type-guards.ts';

/** The git queries that the shared helpers make, each returning parsed values. */
export interface SharedGit {
  /** Returns the checked-out branch name, or an empty string on a detached HEAD. Throws when git fails. */
  findCurrentBranch(cwd: string): Promise<string>;
  /** Returns the named remote's fetch URL, or undefined when git reports an empty one. Throws when git fails. */
  findRemoteUrl(cwd: string, name: string): Promise<string | undefined>;
  /** Returns the working-tree root containing `startDir`, or git's own diagnostic when it cannot supply one. */
  findTopLevel(startDir: string): TopLevelResult;
  /** Returns the remote names in the order that git lists them. Throws when git fails. */
  listRemotes(cwd: string): Promise<string[]>;
}

/** The git working-tree root, or the diagnostic produced by git when it could not supply one. */
export type TopLevelResult = { readonly root: string } | { readonly failure: string };

/** The adapter that runs git. */
export const realGit: SharedGit = {
  findCurrentBranch,
  findRemoteUrl,
  findTopLevel,
  listRemotes,
};

// region | Helpers

const execFileAsync = promisify(execFile);

/** Extracts git's own message from a failed `execFileSync` call, falling back to the thrown error's own text. */
function describeGitFailure(error: unknown): string {
  const stderr = isRecord(error) ? error['stderr'] : undefined;
  if (typeof stderr === 'string' && stderr.trim() !== '') {
    return stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/** Runs `git branch --show-current`, which prints an empty line on a detached HEAD. */
async function findCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
  return stdout.trim();
}

/** Runs `git remote get-url` for the named remote. */
async function findRemoteUrl(cwd: string, name: string): Promise<string | undefined> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', name]);
  const url = stdout.trim();
  return url === '' ? undefined : url;
}

/** Runs `git rev-parse --show-toplevel`, capturing stderr so that a failure can quote git. */
function findTopLevel(startDir: string): TopLevelResult {
  try {
    const stdout = execFileSync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const root = stdout.trim();
    return root === '' ? { failure: 'git returned an empty working-tree root' } : { root };
  } catch (error) {
    return { failure: describeGitFailure(error) };
  }
}

/** Runs `git remote`, which prints one remote name per line. */
async function listRemotes(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote']);
  return stdout
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

// endregion | Helpers
