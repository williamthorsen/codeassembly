/* eslint n/no-process-exit: off -- CLI entry point: the helper's failure exit must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never when the module is imported. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the termination mechanism at the process boundary. */
/**
 * CLI entry for the streamline-guidance helper.
 *
 * `resolve <path>...` reports the files that a run may cut, and `check` reports the evidence against the candidate cuts
 * that it reads on standard input. JSON on stdout is the only output, and the helper edits no guidance: cuts are applied
 * through the agent's own editing tool.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { scanFlags } from '../lib/parse-flags.ts';
import { checkCuts, parseCheckInput } from './check.ts';
import { parseRecord, RECORD_PATH } from './record.ts';
import { findRepositoryRoot, InvalidIncludeError, NotARepositoryError, resolveGuidance } from './resolve.ts';
import type { CheckInput, CheckSuccess, DeclineRecord, HelperFailure, ResolveSuccess } from './types.ts';

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
}): Promise<CheckSuccess | HelperFailure | ResolveSuccess> {
  const [command, ...rest] = input.argv;
  switch (command) {
    case 'check':
      return rest.length === 0
        ? runCheck({ cwd: input.cwd, inputJson: await input.readStdin() })
        : {
            ok: false,
            error: 'invalid-args',
            message: 'check takes no arguments; it reads its cuts on standard input',
          };
    case 'resolve':
      return runResolve({ argv: rest, cwd: input.cwd, home: input.home });
    default:
      return {
        ok: false,
        error: 'invalid-args',
        message: `expected a command (check, resolve), got ${command ?? 'none'}`,
      };
  }
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
  let content: string;
  try {
    content = readFileSync(path.join(root, RECORD_PATH), 'utf8');
  } catch {
    return { declined: [] };
  }
  return parseRecord(content);
}

// endregion | Helpers
