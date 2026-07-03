/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { readAll } from '../lib/stream-helpers.ts';
import { deleteMemories } from './delete-memory.ts';
import { enumerateFeedbackMemories } from './enumerate.ts';
import { resolveProjectsRoot } from './resolve-projects-root.ts';
import type { MigrateFailure, MigrateResult } from './types.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runMigrate({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      env: process.env,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures. Unexpected
    // throws (permission denied, out-of-disk) take the catch arm below.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`migrate-feedback-memories: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end, dispatching on the subcommand. `enumerate` (read-only) resolves the machine's projects
 * root and lists every feedback memory with provenance, optionally scoped to one store with `--store <slug>`. `delete`
 * reads newline-separated memory paths from stdin,
 * removes each file, and reconciles the affected `MEMORY.md` indexes. A missing or unknown subcommand, or an
 * unexpected argument, is a recoverable `invalid-args` result. System failures propagate to the caller's try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runMigrate(input: {
  argv: readonly string[];
  stdin: Readable;
  env?: NodeJS.ProcessEnv;
  home?: string;
  machine?: string;
}): Promise<MigrateResult> {
  const [subcommand, ...rest] = input.argv;

  if (subcommand === 'enumerate') {
    const parsed = parseEnumerateArgs(rest);
    if (!parsed.ok) {
      return invalidArgs(parsed.message);
    }
    const projectsRoot = resolveProjectsRoot({
      ...(input.home !== undefined && { home: input.home }),
      ...(input.env !== undefined && { env: input.env }),
    });
    return enumerateFeedbackMemories({
      projectsRoot,
      ...(parsed.store !== undefined && { store: parsed.store }),
      ...(input.machine !== undefined && { machine: input.machine }),
    });
  }

  if (subcommand === 'delete') {
    if (rest.length > 0) {
      return invalidArgs(`delete takes memory paths on stdin, not arguments; got: ${rest.join(' ')}`);
    }
    const paths = parsePaths(await readAll(input.stdin));
    return deleteMemories({ paths });
  }

  return invalidArgs(
    subcommand === undefined ? 'a subcommand is required: enumerate or delete' : `unknown subcommand: ${subcommand}`,
  );
}

// region | Helpers

/**
 * Parses the `enumerate` subcommand's optional `--store <slug>` (or `--store=<slug>`) flag, which scopes enumeration to
 * a single project store; any other argument is rejected. A value that opens with `--` is treated as missing, so a
 * dangling `--store` before another flag fails rather than swallowing it — store slugs begin with a single `-`, so a
 * real slug is never mistaken for a flag.
 */
function parseEnumerateArgs(rest: readonly string[]): { ok: true; store?: string } | { ok: false; message: string } {
  let store: string | undefined;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--store') {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return { ok: false, message: '--store requires a store slug' };
      }
      store = value;
      index += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith('--store=')) {
      const value = arg.slice('--store='.length);
      if (value.length === 0) {
        return { ok: false, message: '--store requires a store slug' };
      }
      store = value;
      continue;
    }
    return { ok: false, message: `enumerate accepts only --store <slug>; got: ${arg}` };
  }
  return store === undefined ? { ok: true } : { ok: true, store };
}

/** Splits newline-separated stdin into a list of non-empty, trimmed memory paths. */
function parsePaths(stdinText: string): string[] {
  return stdinText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Builds a recoverable `invalid-args` failure with the given message. */
function invalidArgs(message: string): MigrateFailure {
  return { ok: false, error: 'invalid-args', message };
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns `false`,
 * matching the degrade-with-warning pattern used by `kb-add` and `capture-event`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`migrate-feedback-memories: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
