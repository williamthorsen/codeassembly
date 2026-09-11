/* eslint n/no-process-exit: off -- CLI entry point: the helper's failure exit must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never when the module is imported. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the termination mechanism at the process boundary. */
/**
 * CLI entry for the streamline-guidance helper.
 *
 * `resolve <path>...` reports the files that a run may cut. JSON on stdout is the only output, and the helper edits no
 * guidance: cuts are applied through the agent's own editing tool.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { scanFlags } from '../lib/parse-flags.ts';
import { parseRecord, RECORD_PATH } from './record.ts';
import { findRepositoryRoot, InvalidIncludeError, NotARepositoryError, resolveGuidance } from './resolve.ts';
import type { DeclineRecord, HelperFailure, ResolveSuccess } from './types.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runCommand({ argv: process.argv.slice(2), cwd: process.cwd(), home: homedir() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`streamline-guidance: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Dispatches one invocation to its command. An unknown or missing command is a structured failure.
 *
 * @internal - Exported to allow testing.
 */
export async function runCommand(input: {
  argv: readonly string[];
  cwd: string;
  home: string;
}): Promise<HelperFailure | ResolveSuccess> {
  const [command, ...rest] = input.argv;
  if (command === 'resolve') {
    return runResolve({ argv: rest, cwd: input.cwd, home: input.home });
  }
  return { ok: false, error: 'invalid-args', message: `expected a command (resolve), got ${command ?? 'none'}` };
}

/**
 * Resolves the named paths into targets and transitive files. A path that cannot be a target is reported in the
 * result; a missing path argument, a directory outside git, a malformed record, and an unresolvable include are
 * structured failures.
 *
 * @internal - Exported to allow testing.
 */
export async function runResolve(input: {
  argv: readonly string[];
  cwd: string;
  home: string;
}): Promise<HelperFailure | ResolveSuccess> {
  let paths: string[];
  try {
    paths = scanFlags(input.argv, []).positionals;
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: describeError(error) };
  }
  if (paths.length === 0) {
    return { ok: false, error: 'invalid-args', message: 'resolve takes one or more paths' };
  }

  let root: string;
  try {
    root = findRepositoryRoot(input.cwd);
  } catch (error) {
    if (!(error instanceof NotARepositoryError)) throw error;
    return { ok: false, error: 'not-a-repository', message: error.message };
  }

  let record: DeclineRecord;
  try {
    record = readRecordFile(root);
  } catch (error) {
    return { ok: false, error: 'invalid-record', message: describeError(error) };
  }

  try {
    return await resolveGuidance({ cwd: input.cwd, home: input.home, paths, record, root });
  } catch (error) {
    if (!(error instanceof InvalidIncludeError)) throw error;
    return { ok: false, error: 'invalid-include', message: error.message };
  }
}

// region | Helpers

/** Returns true when this module is the process entry point, resolving both sides so a symlinked path still matches. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`streamline-guidance: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Reads the repository's record, treating an absent file as the empty record. */
function readRecordFile(root: string): DeclineRecord {
  let content: string;
  try {
    content = readFileSync(path.join(root, RECORD_PATH), 'utf8');
  } catch {
    return { declined: [] };
  }
  return parseRecord(content);
}

// endregion | Helpers
