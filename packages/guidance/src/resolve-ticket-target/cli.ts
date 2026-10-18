/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on failure, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the resolve-ticket-target helper: fetches another repository's ticket configuration and prints
// where it was written as JSON.

import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { type GhResult, resolveTicketTarget } from './resolve-ticket-target.ts';

const PROGRAM = 'resolve-ticket-target';

const execFileAsync = promisify(execFile);

/** Resolves the target that `--repo` names, writing the result to stdout and a warning per missing file to stderr. */
async function main(): Promise<void> {
  try {
    const { flags, positionals } = scanFlags(process.argv.slice(2), [{ name: 'repo', takesValue: true }]);
    if (positionals.length > 0) {
      throw new Error(`unexpected argument: ${positionals.join(' ')}`);
    }
    const repo = valueFlagMap(flags).repo?.trim();
    if (repo === undefined || repo === '') {
      throw new Error('--repo is required');
    }

    const target = await resolveTicketTarget({ gh: runGh, repo, tempRoot: tmpdir() });
    for (const file of target.missing) {
      process.stderr.write(`${PROGRAM}: ${target.repo} does not contain ${file} on its default branch\n`);
    }
    process.stdout.write(`${JSON.stringify(target)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}

// region | Helpers

/** Runs `gh` without a shell and reports its exit code and output; throws when `gh` cannot be started. */
async function runGh(args: readonly string[]): Promise<GhResult> {
  try {
    const { stderr, stdout } = await execFileAsync('gh', args, { maxBuffer: 16_777_216 });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error('gh is not installed or not on PATH', { cause: error });
    }
    if (
      isRecord(error) &&
      typeof error.code === 'number' &&
      typeof error.stderr === 'string' &&
      typeof error.stdout === 'string'
    ) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

// endregion | Helpers
