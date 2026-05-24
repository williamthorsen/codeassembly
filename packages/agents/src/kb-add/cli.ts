/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@codeassembly/kb-core';
import { loadSchema } from '@codeassembly/kb-core/schema';
import { loadAliases } from '@codeassembly/kb-core/tags';

import { prepareNote } from './prepare-note.ts';
import { resolveKb } from './resolve-kb.ts';
import type { AddResult, ParsedArgs } from './types.ts';
import { writeNote } from './write-note.ts';

/** Flag names that take a value. */
const VALUE_FLAGS = ['kb', 'folder', 'type', 'title', 'tags', 'last-verified'] as const;
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
  const type = raw.type;
  if (type === undefined) {
    throw new Error('--type is required');
  }

  return {
    kb: raw.kb ?? null,
    folder: raw.folder ?? null,
    type,
    title,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
    lastVerified: raw['last-verified'] ?? null,
  };
}

/**
 * Runs the helper end to end: parses args, reads the note body from stdin, resolves a single KB, loads its schema and
 * aliases, prepares and validates the frontmatter, and writes the note. Recoverable failures (no resolvable KB,
 * collision, schema validation, invalid title or args) become structured `{ ok: false, ... }` results. System failures
 * (out-of-disk, permission denied) propagate to the caller's try/catch in `main`.
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

  const resolved = await resolveKb({
    startDir: input.startDir,
    explicitKb: args.kb,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    const failure: AddResult = {
      ok: false,
      error: 'no-kb-resolvable',
      message:
        resolved.requestedKb === null
          ? 'no .kb/ discovered, no registry default configured, and no --kb supplied'
          : `--kb "${resolved.requestedKb}" does not match any registered knowledge base`,
    };
    if (resolved.requestedKb !== null) {
      failure.details = { requestedKb: resolved.requestedKb };
    }
    return failure;
  }
  const kb = resolved.kb;

  const kbRoot = { path: kb.path, kbDir: `${kb.path}/.kb`, via: 'ancestor-walk' as const };
  const [schema, aliases] = await Promise.all([loadSchema({ kbRoot }), loadAliasesWithWarning({ kbRoot })]);

  const prep = prepareNote({ args, schema, aliases, now: input.now });
  if (!prep.ok) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `frontmatter did not pass schema validation: ${prep.findings.map((finding) => finding.message).join('; ')}`,
      details: { findings: prep.findings },
    };
  }

  const body = await readAll(input.stdin);

  const write = await writeNote({
    kbPath: kb.path,
    folder: args.folder,
    title: args.title,
    frontmatter: prep.prepared.frontmatter,
    body,
  });

  if (!write.ok) {
    if (write.reason === 'collision') {
      return {
        ok: false,
        error: 'collision',
        message: `a note already exists at the target path; pick a different title or merge into the existing note`,
        details: { existingPath: write.existingPath },
      };
    }
    if (write.reason === 'invalid-folder') {
      return { ok: false, error: 'invalid-args', message: write.message };
    }
    return { ok: false, error: 'invalid-title', message: write.message };
  }

  return {
    ok: true,
    path: write.path,
    kb,
    frontmatter: prep.prepared.frontmatter,
    originalTags: prep.prepared.originalTags,
    canonicalTags: prep.prepared.canonicalTags,
  };
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

/** Matches a `--kb`/`--folder`/`--type`/`--title`/`--tags`/`--last-verified` flag, returning its key and any inline `=value`. */
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

/** Splits a comma-separated tag string into individual tags, dropping empties and trimming whitespace. */
function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Reads a readable stream to completion as a UTF-8 string. */
async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk, 'utf8'));
    } else {
      chunks.push(Buffer.from(String(chunk), 'utf8'));
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

// endregion | Helpers
