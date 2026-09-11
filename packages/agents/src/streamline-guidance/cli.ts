/* eslint n/no-process-exit: off -- CLI entry point: the helper's failure exit must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never when the module is imported. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the termination mechanism at the process boundary. */
/**
 * CLI entry for the streamline-guidance helper.
 *
 * `resolve <path>...` reports the files that a run may cut, `check` reports the evidence against the candidate cuts that
 * it reads on standard input, and `record` folds the cuts that the user declined into the repository's record. JSON on
 * stdout is the only output, and the helper edits no guidance: cuts are applied through the agent's own editing tool.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { scanFlags } from '../lib/parse-flags.ts';
import { checkCuts, parseCheckInput } from './check.ts';
import { composeRecord, parseFold, parseRecord, RECORD_PATH, stringifyRecord } from './record.ts';
import { findRepositoryRoot, InvalidIncludeError, NotARepositoryError, resolveGuidance } from './resolve.ts';
import type {
  CheckInput,
  CheckSuccess,
  DeclineFold,
  DeclineRecord,
  HelperFailure,
  RecordSuccess,
  ResolveSuccess,
} from './types.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runCommand({ argv: process.argv.slice(2), cwd: process.cwd(), home: homedir(), readStdin });
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
 * Reports the history and test assertions of each candidate cut read from `inputJson`. Malformed input and a working
 * directory outside git are structured failures.
 *
 * @internal - Exported to allow testing.
 */
export function runCheck(input: { cwd: string; inputJson: string }): CheckSuccess | HelperFailure {
  let cuts: CheckInput[];
  try {
    cuts = parseCheckInput(input.inputJson);
  } catch (error) {
    return { ok: false, error: 'invalid-input', message: describeError(error) };
  }

  let root: string;
  try {
    root = findRepositoryRoot(input.cwd);
  } catch (error) {
    if (!(error instanceof NotARepositoryError)) throw error;
    return { ok: false, error: 'not-a-repository', message: error.message };
  }

  return { ok: true, reports: checkCuts({ root, cuts }) };
}

/**
 * Dispatches one invocation to its command. An unknown or missing command, and an argument that the command does not
 * take, are structured failures.
 *
 * @internal - Exported to allow testing.
 */
export async function runCommand(input: {
  argv: readonly string[];
  cwd: string;
  home: string;
  readStdin: () => Promise<string>;
}): Promise<CheckSuccess | HelperFailure | RecordSuccess | ResolveSuccess> {
  const [command, ...rest] = input.argv;
  switch (command) {
    case 'check':
      return rest.length === 0
        ? runCheck({ cwd: input.cwd, inputJson: await input.readStdin() })
        : rejectArguments('check');
    case 'record':
      return rest.length === 0
        ? runRecord({ cwd: input.cwd, foldJson: await input.readStdin() })
        : rejectArguments('record');
    case 'resolve':
      return runResolve({ argv: rest, cwd: input.cwd, home: input.home });
    default:
      return {
        ok: false,
        error: 'invalid-args',
        message: `expected a command (check, record, resolve), got ${command ?? 'none'}`,
      };
  }
}

/**
 * Folds one run's declined cuts into the repository's record and writes it, dropping every entry that is no longer
 * live. A malformed fold, a malformed record, and a working directory outside git are structured failures.
 *
 * @internal - Exported to allow testing.
 */
export function runRecord(input: { cwd: string; foldJson: string }): HelperFailure | RecordSuccess {
  let fold: DeclineFold;
  try {
    fold = parseFold(input.foldJson);
  } catch (error) {
    return { ok: false, error: 'invalid-input', message: describeError(error) };
  }

  let root: string;
  try {
    root = findRepositoryRoot(input.cwd);
  } catch (error) {
    if (!(error instanceof NotARepositoryError)) throw error;
    return { ok: false, error: 'not-a-repository', message: error.message };
  }

  let prior: DeclineRecord;
  try {
    prior = readRecordFile(root);
  } catch (error) {
    return { ok: false, error: 'invalid-record', message: describeError(error) };
  }

  const record = composeRecord(prior, fold, (file) => readFileIfPresent(path.join(root, file)));
  const absolutePath = path.join(root, RECORD_PATH);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, stringifyRecord(record), 'utf8');
  return { ok: true, path: RECORD_PATH, declined: record.declined.length };
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

/** Returns a file's content, or undefined where it cannot be read. */
function readFileIfPresent(absolutePath: string): string | undefined {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch {
    return undefined;
  }
}

/** Builds the failure for a command that reads its input on standard input and was given arguments. */
function rejectArguments(command: string): HelperFailure {
  return {
    ok: false,
    error: 'invalid-args',
    message: `${command} takes no arguments; it reads its input on standard input`,
  };
}

/** Reads standard input to its end. */
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  // The stream yields `any`, so each chunk is narrowed rather than asserted: a string arrives where an encoding is set.
  for await (const chunk of process.stdin) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Reads the repository's record, treating an absent file as the empty record. */
function readRecordFile(root: string): DeclineRecord {
  const content = readFileIfPresent(path.join(root, RECORD_PATH));
  return content === undefined ? { declined: [] } : parseRecord(content);
}

// endregion | Helpers
