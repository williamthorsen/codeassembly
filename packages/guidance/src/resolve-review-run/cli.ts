/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the resolve-review-run helper: finds or opens a ticket's active review run, or finds its newest review.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { findActiveRun, findLatestReview, openRun } from './review-run.ts';

const FLAGS = [
  { name: 'ticket-dir', takesValue: true },
  { name: 'timestamp', takesValue: true },
] as const satisfies readonly FlagSpec[];

const USAGE =
  'usage: resolve-review-run active --ticket-dir <dir>\n' +
  '       resolve-review-run latest --ticket-dir <dir>\n' +
  '       resolve-review-run open --ticket-dir <dir> --timestamp <YYYYMMDD-HHMMSSZ>';

/** Runs the subcommand named in `process.argv`, writing the JSON result to stdout and every diagnostic to stderr. */
async function main(): Promise<void> {
  try {
    const result = await runCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`resolve-review-run: ${describeError(error)}\n`);
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
    process.stderr.write(`resolve-review-run: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Throws when `--timestamp` is passed to a subcommand that does not take it. */
function rejectTimestamp(values: Record<string, string>, command: string): void {
  if (values.timestamp !== undefined) {
    throw new Error(`${command} does not take --timestamp\n${USAGE}`);
  }
}

/** Returns the flag's value; throws when the flag is absent. */
function requireValue(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`--${name} is required\n${USAGE}`);
  }
  return value;
}

/** Parses argv and runs its subcommand. Throws on an unknown subcommand or flag, or a flag that the subcommand lacks. */
async function runCommand(argv: readonly string[]): Promise<Record<string, string | null>> {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  const [command, ...extra] = positionals;
  if (extra.length > 0) {
    throw new Error(`unexpected argument: ${extra.join(' ')}\n${USAGE}`);
  }
  const values = valueFlagMap(flags);

  if (command === 'active') {
    rejectTimestamp(values, command);
    const runDir = await findActiveRun(requireValue(values, 'ticket-dir'));
    return { runDir: runDir ?? null };
  }
  if (command === 'latest') {
    rejectTimestamp(values, command);
    const { reviewPath, runDir } = await findLatestReview(requireValue(values, 'ticket-dir'));
    return { reviewPath, runDir };
  }
  if (command === 'open') {
    const runDir = await openRun(requireValue(values, 'ticket-dir'), requireValue(values, 'timestamp'));
    return { runDir };
  }
  throw new Error(command === undefined ? USAGE : `unknown command: ${command}\n${USAGE}`);
}

// endregion | Helpers
