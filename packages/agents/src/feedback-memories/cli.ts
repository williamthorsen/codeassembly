/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { readAll } from '../lib/stream-helpers.ts';
import { deleteMemories } from './delete-memory.ts';
import { enumerateFeedbackMemories } from './enumerate.ts';
import { reportSummary } from './report.ts';
import { resolveProjectsRoot } from './resolve-projects-root.ts';
import { summarizeFeedbackMemories } from './summarize.ts';
import type { FeedbackMemoriesFailure, FeedbackMemoriesResult, RenderedResult } from './types.ts';

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
    const message = error instanceof Error ? error.message : String(error);
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
 * provenance. Both accept `--store <slug>` to scope to one store, and `list` also accepts `--verbose`. `delete` reads
 * newline-separated memory paths from stdin, removes each file, and reconciles the affected `MEMORY.md` indexes.
 * `--help` prints usage. A missing or unknown subcommand, or an unexpected argument, is a recoverable `invalid-args`
 * result. System failures propagate to the caller's try/catch.
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

  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    return text(usage());
  }

  if (subcommand === 'list') {
    const parsed = parseListArgs(rest);
    if (!parsed.ok) {
      return json(invalidArgs(parsed.message));
    }
    const summary = await summarizeFeedbackMemories({
      projectsRoot: projectsRootFor(input),
      ...(parsed.store !== undefined && { store: parsed.store }),
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
        ...(parsed.store !== undefined && { store: parsed.store }),
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
 * Matches a `--store` flag at `rest[index]` in either the `--store <slug>` or `--store=<slug>` form, returning the slug
 * and how many argv items it consumed, a parse error, or null when the argument is not a `--store` form. A value that
 * opens with `--` is treated as missing, so a dangling `--store` before another flag fails rather than swallowing it —
 * store slugs begin with a single `-`, so a real slug is never mistaken for a flag.
 */
function matchStoreFlag(
  rest: readonly string[],
  index: number,
): { store: string; consumed: number } | { error: string } | null {
  const arg = rest[index];
  if (arg === '--store') {
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: '--store requires a store slug' };
    }
    return { store: value, consumed: 2 };
  }
  if (arg !== undefined && arg.startsWith('--store=')) {
    const value = arg.slice('--store='.length);
    if (value.length === 0) {
      return { error: '--store requires a store slug' };
    }
    return { store: value, consumed: 1 };
  }
  return null;
}

/** Parses the `enumerate` subcommand's optional `--store <slug>` flag; any other argument is rejected. */
function parseEnumerateArgs(rest: readonly string[]): { ok: true; store?: string } | { ok: false; message: string } {
  let store: string | undefined;
  for (let index = 0; index < rest.length; index++) {
    const matched = matchStoreFlag(rest, index);
    if (matched === null) {
      return { ok: false, message: `enumerate accepts only --store <slug>; got: ${rest[index]}` };
    }
    if ('error' in matched) {
      return { ok: false, message: matched.error };
    }
    store = matched.store;
    index += matched.consumed - 1;
  }
  return store === undefined ? { ok: true } : { ok: true, store };
}

/** Parses the `list` subcommand's optional `--store <slug>` and `--verbose` flags; any other argument is rejected. */
function parseListArgs(
  rest: readonly string[],
): { ok: true; store?: string; verbose: boolean } | { ok: false; message: string } {
  let store: string | undefined;
  let verbose = false;
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--verbose') {
      verbose = true;
      continue;
    }
    const matched = matchStoreFlag(rest, index);
    if (matched === null) {
      return { ok: false, message: `list accepts only --store <slug> and --verbose; got: ${rest[index]}` };
    }
    if ('error' in matched) {
      return { ok: false, message: matched.error };
    }
    store = matched.store;
    index += matched.consumed - 1;
  }
  return store === undefined ? { ok: true, verbose } : { ok: true, store, verbose };
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
    '  feedback-memories list [--store <slug>] [--verbose]',
    '  feedback-memories enumerate [--store <slug>]',
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
    '  --store <slug>  Scope to one project store. <slug> is the project directory name, as shown in',
    "                  enumerate's `store` field (e.g. -Users-me-repos-app).",
    '  --verbose       (list) List each memory with its description.',
    '  -h, --help      Show this help.',
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`feedback-memories: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
