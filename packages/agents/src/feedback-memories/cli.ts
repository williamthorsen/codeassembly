/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readAll } from '../lib/stream-helpers.ts';
import { deleteMemories } from './delete-memory.ts';
import { enumerateFeedbackMemories } from './enumerate.ts';
import { reportSummary } from './report.ts';
import { resolveProjectsRoot } from './resolve-projects-root.ts';
import { summarizeFeedbackMemories } from './summarize.ts';
import type { FeedbackMemoriesFailure, FeedbackMemoriesResult, RenderedResult } from './types.ts';

const MEMORY_STORE_FLAG = '--memory-store';

/** Executes the helper from `process.argv` and writes its result to stdout: text for `list` and `--help`, else JSON. */
async function main(): Promise<void> {
  try {
    const result = await runFeedbackMemories({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      env: process.env,
      // `columns` is typed as `number` but is `undefined` when stdout is not a TTY (e.g. piped); the reporter falls
      // back to a default width in that case.
      columns: process.stdout.columns,
    });
    const rendered = result.render === 'text' ? result.value : JSON.stringify(result.value, null, 2);
    process.stdout.write(`${rendered}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures. Unexpected
    // throws (permission denied, out-of-disk) take the catch arm below.
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`feedback-memories: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end, dispatching on the subcommand. `list` (read-only) renders a per-project summary of
 * feedback-memory counts and recency for humans; `enumerate` (read-only) lists every feedback memory as JSON with
 * provenance. Both accept `--memory-store <name>` to scope to one memory store, and `list` also accepts `--verbose`.
 * `delete` reads newline-separated memory paths from stdin, removes each file, and reconciles the affected `MEMORY.md`
 * indexes. `--help` prints usage. A missing or unknown subcommand, or an unexpected argument, is a recoverable
 * `invalid-args` result. System failures propagate to the caller's try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runFeedbackMemories(input: {
  argv: readonly string[];
  stdin: Readable;
  env?: NodeJS.ProcessEnv;
  home?: string;
  machine?: string;
  columns?: number;
}): Promise<RenderedResult> {
  const [subcommand, ...rest] = input.argv;

  if (subcommand && ['--help', '-h', 'help'].includes(subcommand)) {
    return text(usage());
  }

  if (subcommand === 'list') {
    const parsed = parseListArgs(rest);
    if (!parsed.ok) {
      return json(invalidArgs(parsed.message));
    }
    const summary = await summarizeFeedbackMemories({
      projectsRoot: projectsRootFor(input),
      ...(parsed.memoryStore !== undefined && { memoryStore: parsed.memoryStore }),
      ...(input.machine !== undefined && { machine: input.machine }),
    });
    if (!summary.ok) {
      return json(summary);
    }
    return text(
      reportSummary(summary, {
        verbose: parsed.verbose,
        ...(input.columns !== undefined && { width: input.columns }),
      }),
    );
  }

  if (subcommand === 'enumerate') {
    const parsed = parseEnumerateArgs(rest);
    if (!parsed.ok) {
      return json(invalidArgs(parsed.message));
    }
    return json(
      await enumerateFeedbackMemories({
        projectsRoot: projectsRootFor(input),
        ...(parsed.memoryStore !== undefined && { memoryStore: parsed.memoryStore }),
        ...(input.machine !== undefined && { machine: input.machine }),
      }),
    );
  }

  if (subcommand === 'delete') {
    if (rest.length > 0) {
      return json(invalidArgs(`delete takes memory paths on stdin, not arguments; got: ${rest.join(' ')}`));
    }
    const paths = parsePaths(await readAll(input.stdin));
    return json(await deleteMemories({ paths }));
  }

  return json(
    invalidArgs(
      subcommand === undefined
        ? 'a subcommand is required: list, enumerate, or delete (see --help)'
        : `unknown subcommand: ${subcommand}`,
    ),
  );
}

// region | Helpers

/** Wraps a JSON-serializable subcommand result for stdout as JSON. */
function json(value: FeedbackMemoriesResult): RenderedResult {
  return { render: 'json', value };
}

/** Wraps pre-rendered human text for stdout verbatim. */
function text(value: string): RenderedResult {
  return { render: 'text', value };
}

/** Resolves the machine's projects root from the injected home and environment. */
function projectsRootFor(input: { home?: string; env?: NodeJS.ProcessEnv }): string {
  return resolveProjectsRoot({
    ...(input.home !== undefined && { home: input.home }),
    ...(input.env !== undefined && { env: input.env }),
  });
}

/**
 * Matches a `--memory-store` flag at `rest[index]` in either the `--memory-store <name>` or `--memory-store=<name>`
 * form, returning the name and how many argv items it consumed, a parse error, or null when the argument is not a
 * `--memory-store` form. A value that opens with `--` is treated as missing, so a dangling `--memory-store` before
 * another flag fails rather than swallowing it — memory-store slugs begin with a single `-`, so a real name is never
 * mistaken for a flag.
 */
function matchMemoryStoreFlag(
  rest: readonly string[],
  index: number,
): { memoryStore: string; consumed: number } | { error: string } | null {
  const arg = rest[index];
  if (arg === MEMORY_STORE_FLAG) {
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: `${MEMORY_STORE_FLAG} requires a memory-store name` };
    }
    return { memoryStore: value, consumed: 2 };
  }
  const assigned = `${MEMORY_STORE_FLAG}=`;
  if (arg !== undefined && arg.startsWith(assigned)) {
    const value = arg.slice(assigned.length);
    if (value.length === 0) {
      return { error: `${MEMORY_STORE_FLAG} requires a memory-store name` };
    }
    return { memoryStore: value, consumed: 1 };
  }
  return null;
}

/** Parses the `enumerate` subcommand's optional `--memory-store <name>` flag; any other argument is rejected. */
function parseEnumerateArgs(
  rest: readonly string[],
): { ok: true; memoryStore?: string } | { ok: false; message: string } {
  let memoryStore: string | undefined;
  for (let index = 0; index < rest.length; index++) {
    const matched = matchMemoryStoreFlag(rest, index);
    if (matched === null) {
      return { ok: false, message: rejectArg(`enumerate accepts only ${MEMORY_STORE_FLAG} <name>`, rest[index]) };
    }
    if ('error' in matched) {
      return { ok: false, message: matched.error };
    }
    memoryStore = matched.memoryStore;
    index += matched.consumed - 1;
  }
  return memoryStore === undefined ? { ok: true } : { ok: true, memoryStore };
}

/**
 * Parses the `list` subcommand's optional `--memory-store <name>` and `--verbose` flags; any other argument is rejected.
 */
function parseListArgs(
  rest: readonly string[],
): { ok: true; memoryStore?: string; verbose: boolean } | { ok: false; message: string } {
  let memoryStore: string | undefined;
  let verbose = false;
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--verbose') {
      verbose = true;
      continue;
    }
    const matched = matchMemoryStoreFlag(rest, index);
    if (matched === null) {
      return {
        ok: false,
        message: rejectArg(`list accepts only ${MEMORY_STORE_FLAG} <name> and --verbose`, rest[index]),
      };
    }
    if ('error' in matched) {
      return { ok: false, message: matched.error };
    }
    memoryStore = matched.memoryStore;
    index += matched.consumed - 1;
  }
  return memoryStore === undefined ? { ok: true, verbose } : { ok: true, memoryStore, verbose };
}

/**
 * Builds the rejection message for an argument the subcommand does not accept. A `--store` form is answered by naming
 * the distinction rather than by the generic message: `--store` selects a KB store for the `capture-event` and `kb-*`
 * skills, and reaching for it here is exactly the confusion `--memory-store` is named to prevent.
 */
function rejectArg(accepted: string, arg: string | undefined): string {
  if (arg === '--store' || (arg !== undefined && arg.startsWith('--store='))) {
    return `--store selects a KB store; this helper takes ${MEMORY_STORE_FLAG} <name>`;
  }
  return `${accepted}; got: ${arg}`;
}

/** Splits newline-separated stdin into a list of non-empty, trimmed memory paths. */
function parsePaths(stdinText: string): string[] {
  return stdinText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Builds a recoverable `invalid-args` failure with the given message. */
function invalidArgs(message: string): FeedbackMemoriesFailure {
  return { ok: false, error: 'invalid-args', message };
}

/** Returns the command's usage text. */
function usage(): string {
  return [
    "feedback-memories — inspect this machine's feedback memories",
    '',
    'Usage:',
    '  feedback-memories list [--memory-store <name>] [--verbose]',
    '  feedback-memories enumerate [--memory-store <name>]',
    '  feedback-memories delete < paths-on-stdin',
    '  feedback-memories --help',
    '',
    'Verbs:',
    "  list        Show feedback-memory counts per project with the newest memory's modification time.",
    '              --verbose additionally lists each memory and its description.',
    '  enumerate   Print every feedback memory as JSON (consumed by the migrate-feedback-memories skill).',
    '  delete      Remove the newline-separated memory paths piped on stdin and reconcile each MEMORY.md.',
    '',
    'Options:',
    '  --memory-store <name>  Scope to one memory store. <name> is either the store directory name, as shown',
    "                         in enumerate's `memoryStore` field (e.g. -Users-me-repos-app), or the project",
    '                         label that list prints (e.g. app).',
    '  --verbose              (list) List each memory with its description.',
    '  -h, --help             Show this help.',
  ].join('\n');
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
    const message = describeError(error);
    process.stderr.write(`feedback-memories: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
