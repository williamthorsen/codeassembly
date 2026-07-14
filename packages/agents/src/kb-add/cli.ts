/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@codeassembly/kb';
import { resolveKbDir } from '@codeassembly/kb/layout';
import { loadAliases } from '@codeassembly/kb/tags';

import { formatMissingDestinationMessage } from '../kb-shared/format-missing-destination.ts';
import { resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { prepareNote } from './prepare-note.ts';
import type { AddResult, ParsedArgs } from './types.ts';
import { writeNote } from './write-note.ts';

/** Flag names that take a value. */
const VALUE_FLAGS = ['kb', 'folder', 'diataxis', 'title', 'tags'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runAdd({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures.
    // System failures (unexpected throws) take the catch arm below.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-add: ${message}\n`);
    process.exit(1);
  }
}

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv. Each value-bearing flag accepts both `--flag value` and `--flag=value`. `--tags` accepts a
 * comma-separated list. Unknown flags or missing required values throw with a usage-style message. The arg layout is
 * flag-only (no positional arguments), reflecting that the note body comes from stdin rather than the command line.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const raw: Partial<Record<ValueFlag, string>> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    const matched = matchValueFlag(arg);
    if (matched === null) {
      throw new Error(`unknown flag: ${arg}`);
    }
    const { key } = matched;
    let value = matched.inlineValue;
    if (value === null) {
      value = argv[index + 1] ?? null;
      index += 1;
    }
    if (value === null || value === '' || value.startsWith('--')) {
      throw new Error(`--${key} requires a value`);
    }
    raw[key] = value;
  }

  const title = raw.title;
  if (title === undefined) {
    throw new Error('--title is required');
  }

  return {
    kb: raw.kb ?? null,
    folder: raw.folder ?? null,
    diataxis: raw.diataxis ?? null,
    title,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
  };
}

/**
 * Runs the helper end to end: parses args, resolves a single KB, loads its tag aliases, reads the note body from
 * stdin, composes a born-verified assertion record, and writes the note. Recoverable failures (no resolvable KB,
 * collision, invalid title or args) become structured `{ ok: false, ... }` results. System failures (out-of-disk,
 * permission denied) propagate to the caller's try/catch in `main`.
 *
 * @internal - Exported to allow testing.
 */
export async function runAdd(input: {
  argv: readonly string[];
  stdin: Readable;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<AddResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: error instanceof Error ? error.message : String(error) };
  }

  const resolved = await resolveWritableKb({
    startDir: input.startDir,
    explicitKb: args.kb,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    switch (resolved.reason) {
      case 'no-kb-resolvable':
        return {
          ok: false,
          error: 'no-kb-resolvable',
          message: `--kb "${resolved.requestedKb}" does not match any registered knowledge base`,
          details: { requestedKb: resolved.requestedKb },
        };
      case 'missing-destination':
        return { ok: false, error: 'missing-destination', message: formatMissingDestinationMessage(resolved) };
      case 'no-default':
        return {
          ok: false,
          error: 'no-default',
          message:
            resolved.registryError !== undefined
              ? `could not resolve the default knowledge base: ${resolved.registryError}`
              : '--kb @default was given but no default_kb is configured in kb.yaml',
        };
      case 'readonly-kb':
        return {
          ok: false,
          error: 'readonly-kb',
          message: `knowledge base "${resolved.kbName}" is marked readonly in kb.yaml; writes are refused`,
          details: { readonlyKbName: resolved.kbName, readonlyKbPath: resolved.kbPath },
        };
      default: {
        // Exhaustiveness check: a new ResolveKbOutcome variant will surface here at compile time.
        const _exhaustive: never = resolved;
        throw new Error(`unhandled resolveWritableKb failure: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  const kb = resolved.kb;

  const kbRoot = { path: kb.path, kbDir: resolveKbDir(kb.path), via: 'ancestor-walk' as const };
  const aliases = await loadAliasesWithWarning({ kbRoot });

  const body = await readAll(input.stdin);
  const prepared = prepareNote({ args, aliases, now: input.now, body });

  const write = await writeNote({
    kbPath: kb.path,
    folder: args.folder,
    title: args.title,
    record: prepared.record,
  });

  if (!write.ok) {
    switch (write.reason) {
      case 'collision':
        return {
          ok: false,
          error: 'collision',
          message: `a note already exists at the target path; pick a different title or merge into the existing note`,
          details: { existingPath: write.existingPath },
        };
      case 'invalid-folder':
        return { ok: false, error: 'invalid-args', message: write.message };
      case 'invalid-title':
        return { ok: false, error: 'invalid-title', message: write.message };
      default: {
        // Exhaustiveness check: a new WriteFailure reason will surface here at compile time.
        const _exhaustive: never = write;
        throw new Error(`unhandled WriteFailure: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return {
    ok: true,
    path: write.path,
    kb,
    record: prepared.record,
    originalTags: prepared.originalTags,
    canonicalTags: prepared.canonicalTags,
  };
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure (broken symlink, permission denied) the
 * function emits a warning to stderr and returns `false`, matching the degrade-with-warning pattern used by
 * `loadAliasesWithWarning` and `resolveWritableKb` so that silent skips do not hide environment problems.
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
    process.stderr.write(`kb-add: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/** Matches a `--kb`/`--folder`/`--title`/`--tags` flag (and the optional `--diataxis` Diátaxis label), returning its key and any inline `=value`. */
function matchValueFlag(arg: string): { key: ValueFlag; inlineValue: string | null } | null {
  for (const key of VALUE_FLAGS) {
    if (arg === `--${key}`) {
      return { key, inlineValue: null };
    }
    if (arg.startsWith(`--${key}=`)) {
      return { key, inlineValue: arg.slice(`--${key}=`.length) };
    }
  }
  return null;
}

/**
 * Loads tag aliases, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map and emitting a warning
 * to stderr so the operator can see why canonicalization was skipped. Without the warning, an aliases-load failure
 * looked indistinguishable from "no aliases defined" and silently shipped uncanonicalized tags.
 */
async function loadAliasesWithWarning(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-add: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

// endregion | Helpers
