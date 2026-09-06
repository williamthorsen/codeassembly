import { execFileSync } from 'node:child_process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../type-guards.ts';

/** The outcome of one git invocation: its stdout, or the message it failed with. */
export type GitResult = { ok: true; stdout: string } | { ok: false; message: string };

/**
 * Runs `git -C cwd <args>` and returns its stdout, or a failure carrying git's own stderr. A git that cannot be
 * spawned fails the same way as one that exits non-zero, so both reach the caller as a single "git did not answer".
 */
export function runGit(input: { cwd: string; args: readonly string[]; maxBuffer?: number }): GitResult {
  try {
    const stdout = execFileSync('git', ['-C', input.cwd, ...input.args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(input.maxBuffer !== undefined && { maxBuffer: input.maxBuffer }),
    });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, message: extractGitErrorMessage(error) };
  }
}

// region | Helpers

/** Extracts git's stderr from a thrown `execFileSync` error, falling back to the error's own message. */
function extractGitErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
    return error.stderr.trim();
  }
  return describeError(error);
}

// endregion | Helpers
