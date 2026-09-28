/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the merge-gh-pr helper: merges a pull request and deletes its head branch as one invocation.
//
// The title and body arrive as files, so the agent's command contains neither and nothing in them reaches a shell.

import { execFile } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import {
  type DeletionStrategy,
  type GhResult,
  mergePullRequest,
  type MergeRequest,
  type MergeStrategy,
} from './merge.ts';

const execFileAsync = promisify(execFile);

const FLAGS = [
  { name: 'body-file', takesValue: true },
  { name: 'delete', takesValue: true },
  { name: 'pr', takesValue: true },
  { name: 'strategy', takesValue: true },
  { name: 'title-file', takesValue: true },
] as const satisfies readonly FlagSpec[];

const DELETION_STRATEGIES: readonly DeletionStrategy[] = ['both', 'none', 'remote'];

const STRATEGIES: readonly MergeStrategy[] = ['merge', 'rebase', 'squash'];

/** Parsed argv, before the title and body files are read. */
interface ParsedArgs {
  bodyFile: string | undefined;
  deletionStrategy: DeletionStrategy;
  prNumber: number;
  strategy: MergeStrategy;
  titleFile: string | undefined;
}

/** Runs the merge from `process.argv`, writing the JSON result to stdout and every diagnostic to stderr. */
async function main(): Promise<void> {
  try {
    const request = readRequest(parseArgs(process.argv.slice(2)));
    const outcome = await mergePullRequest(request, runGh);
    if (!outcome.ok) {
      process.stderr.write(outcome.stderr);
      process.exit(outcome.exitCode);
    }
    for (const warning of outcome.warnings) {
      process.stderr.write(`${warning}\n`);
    }
    process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`merge-gh-pr: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning to stderr and
 * returns `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`merge-gh-pr: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Returns true when the path names a file with at least one byte. */
function isNonEmptyFile(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Parses the helper's argv. Throws on an unknown flag, a positional argument, a missing required flag, or a value
 * outside its set.
 */
function parseArgs(argv: readonly string[]): ParsedArgs {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}`);
  }
  const values = valueFlagMap(flags);

  const pr = requireValue(values, 'pr');
  if (!/^[1-9]\d*$/.test(pr)) {
    throw new Error(`--pr must be a positive integer, got '${pr}'`);
  }

  return {
    bodyFile: values['body-file'],
    deletionStrategy: requireMember(values, 'delete', DELETION_STRATEGIES),
    prNumber: Number(pr),
    strategy: requireMember(values, 'strategy', STRATEGIES),
    titleFile: values['title-file'],
  };
}

/**
 * Reads the title and checks the body file for the strategies that use them: `squash` needs both, `merge` needs the
 * body, and `rebase` needs neither. Throws when a file that the strategy needs is not given, absent, or empty.
 */
function readRequest(args: ParsedArgs): MergeRequest {
  const needsBody = args.strategy !== 'rebase';
  const needsTitle = args.strategy === 'squash';

  let title: string | undefined;
  if (needsTitle) {
    title = readTitle(args.titleFile);
  }
  if (needsBody) {
    if (args.bodyFile === undefined) {
      throw new Error(`--body-file is required for --strategy ${args.strategy}`);
    }
    if (!isNonEmptyFile(args.bodyFile)) {
      throw new Error(`Body file missing or empty: ${args.bodyFile}`);
    }
  }

  return {
    bodyPath: needsBody ? args.bodyFile : undefined,
    deletionStrategy: args.deletionStrategy,
    prNumber: args.prNumber,
    strategy: args.strategy,
    title,
  };
}

/** Reads the title file, dropping one trailing newline. Throws when the file is not given, absent, or empty. */
function readTitle(path: string | undefined): string {
  if (path === undefined) {
    throw new Error('--title-file is required for --strategy squash');
  }
  if (!isNonEmptyFile(path)) {
    throw new Error(`Title file missing or empty: ${path}`);
  }
  const title = readFileSync(path, 'utf8').replace(/\r?\n$/, '');
  if (title.length === 0) {
    throw new Error(`Title file missing or empty: ${path}`);
  }
  return title;
}

/** Returns the flag's value when it is one of `members`; throws otherwise. */
function requireMember<Member extends string>(
  values: Record<string, string>,
  name: string,
  members: readonly Member[],
): Member {
  const value = requireValue(values, name);
  const member = members.find((candidate) => candidate === value);
  if (member === undefined) {
    throw new Error(`--${name} must be one of ${members.join(', ')}, got '${value}'`);
  }
  return member;
}

/** Returns the flag's value; throws when the flag is absent. */
function requireValue(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

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
