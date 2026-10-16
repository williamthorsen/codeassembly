/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the check-branch-currency helper: fetches the default branch and reports the branch's position against it.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { type BranchCurrency, checkBranchCurrency, splitBase } from './branch-currency.ts';

const FLAGS = [
  { name: 'base', takesValue: true },
  { name: 'path', takesValue: true },
] as const satisfies readonly FlagSpec[];

const USAGE = 'usage: check-branch-currency --base <remote>/<branch> [--path <path>]...';

/** Runs the check named by `process.argv`, writing the JSON result to stdout and every diagnostic to stderr. */
function main(): void {
  try {
    const result = runCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`check-branch-currency: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  main();
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
    process.stderr.write(`check-branch-currency: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Parses argv and runs the check. Throws on a positional argument, a missing or repeated `--base`, or a malformed one. */
function runCommand(argv: readonly string[]): BranchCurrency {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}\n${USAGE}`);
  }

  const bases = flags.filter((flag) => flag.name === 'base').map((flag) => flag.value ?? '');
  const [base, ...extraBases] = bases;
  if (base === undefined) {
    throw new Error(`--base is required\n${USAGE}`);
  }
  if (extraBases.length > 0) {
    throw new Error(`--base may be given only once\n${USAGE}`);
  }
  splitBase(base);

  const paths = flags.filter((flag) => flag.name === 'path').map((flag) => flag.value ?? '');
  return checkBranchCurrency({ base, cwd: process.cwd(), paths });
}

// endregion | Helpers
