/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@williamthorsen/kb';
import { isKbLoaderError } from '@williamthorsen/kb/config';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import { loadAliases } from '@williamthorsen/kb/tags';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { formatMissingDestinationMessage } from '../kb-shared/format-missing-destination.ts';
import { type ResolvedKb, resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { declareDomain } from './declare-domain.ts';
import { prepareNote } from './prepare-note.ts';
import { surveyKb } from './survey.ts';
import type { AddFailure, AddResult, ParsedArgs, SurveyResult, WriteArgs } from './types.ts';
import { writeNote } from './write-note.ts';

const VALUE_FLAGS = ['kb', 'folder', 'diataxis', 'title', 'tags', 'domain-description'] as const;
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
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-add: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv into a survey or a write invocation, throwing on an unknown flag or a missing required
 * value. The caller turns the throw into an `invalid-args` result.
 *
 * `--survey` selects the read-only survey, which takes `--kb` alone. A note-describing flag alongside it comes from a
 * caller that meant to write, so the parse fails: a survey reported for that invocation would leave the caller
 * expecting a note that nothing wrote.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const raw: Partial<Record<ValueFlag, string>> = {};
  // Every flag a survey does not accept, collected as seen, so a stray one can be named back to the caller.
  const writeOnly = new Set<string>();
  let auto = false;
  let survey = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--survey') {
      survey = true;
      continue;
    }
    if (arg === '--auto') {
      auto = true;
      writeOnly.add('--auto');
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
    if (key !== 'kb') {
      writeOnly.add(`--${key}`);
    }
  }

  if (survey) {
    if (writeOnly.size > 0) {
      throw new Error(`--survey takes only --kb; drop ${writeOnly.values().toArray().toSorted().join(', ')}`);
    }
    return { mode: 'survey', kb: raw.kb ?? null };
  }

  return buildWriteArgs({ raw, auto });
}

/**
 * Runs the helper end to end, from argv and stdin to a written note or a survey of the destination.
 *
 * `--survey` takes the read-only path and returns without touching stdin: the write path reads stdin to EOF, so a
 * survey falling through to it would hang on an interactive invocation.
 *
 * Every recoverable failure becomes a structured `{ ok: false, ... }` result. A system failure propagates to the
 * try/catch in `main`.
 *
 * @internal - Exported to allow testing.
 */
export async function runAdd(input: {
  argv: readonly string[];
  stdin: Readable;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<AddResult | SurveyResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: describeError(error) };
  }

  if (args.mode === 'survey') {
    return runSurvey({
      startDir: input.startDir,
      explicitKb: args.kb,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const resolved = await resolveKb({
    startDir: input.startDir,
    explicitKb: args.kb,
    requireWritable: true,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return resolved.failure;
  }
  const kb = resolved.kb;

  const kbRoot = { path: kb.path, kbDir: resolveKbDir(kb.path) };
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
        const _exhaustive: never = write;
        throw new Error(`unhandled WriteFailure: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // Declare after the note lands, never before: a failure between the two leaves a real note in an undeclared folder,
  // which `taxonomy.undeclared` reports. The reverse order leaves a declared shelf holding nothing, reported as
  // `taxonomy.unused` and indistinguishable from a shelf someone put up on purpose.
  const placement = await declareDomain({
    kbPath: kb.path,
    notePath: write.path,
    description: args.domainDescription,
    auto: args.auto,
  });

  return {
    ok: true,
    mode: 'write',
    path: write.path,
    kb,
    record: prepared.record,
    originalTags: prepared.originalTags,
    canonicalTags: prepared.canonicalTags,
    ...(placement !== undefined && { placement }),
  };
}

// region | Helpers

/** Assembles a write invocation from the raw flag values, applying each optional flag's default. */
function buildWriteArgs(input: { raw: Partial<Record<ValueFlag, string>>; auto: boolean }): WriteArgs {
  const { raw, auto } = input;

  const title = raw.title;
  if (title === undefined) {
    throw new Error('--title is required');
  }

  return {
    mode: 'write',
    kb: raw.kb ?? null,
    folder: raw.folder ?? null,
    diataxis: raw.diataxis ?? null,
    title,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
    domainDescription: raw['domain-description'] ?? null,
    auto,
  };
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. A `realpathSync` failure warns on stderr and returns `false`.
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
    process.stderr.write(`kb-add: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/**
 * Loads tag aliases, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map and emitting a warning
 * to stderr so that the operator sees why canonicalization was skipped.
 */
async function loadAliasesWithWarning(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-add: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

/** Matches any value-bearing flag, returning its key and any inline `=value`. */
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
 * Resolves the KB the invocation addresses and maps a resolution failure to the helper's structured error shape. Both
 * paths route through here, so the survey reaches its store on exactly the rules the write path uses; only
 * `requireWritable` differs, since a survey of a `readonly: true` store is legitimate and a write into one is not.
 */
async function resolveKb(input: {
  startDir: string;
  explicitKb: string | null;
  requireWritable: boolean;
  home?: string;
}): Promise<{ ok: true; kb: ResolvedKb } | { ok: false; failure: AddFailure }> {
  const resolved = await resolveWritableKb({
    startDir: input.startDir,
    explicitKb: input.explicitKb,
    requireWritable: input.requireWritable,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (resolved.ok) {
    return { ok: true, kb: resolved.kb };
  }

  switch (resolved.reason) {
    case 'no-kb-resolvable':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'no-kb-resolvable',
          message: `--kb "${resolved.requestedKb}" does not match any registered knowledge base`,
          details: { requestedKb: resolved.requestedKb },
        },
      };
    case 'missing-destination':
      return {
        ok: false,
        failure: { ok: false, error: 'missing-destination', message: formatMissingDestinationMessage(resolved) },
      };
    case 'no-default':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'no-default',
          message:
            resolved.registryError !== undefined
              ? `could not resolve the default knowledge base: ${resolved.registryError}`
              : '--kb @default was given but no default_kb is configured in kb.yaml',
        },
      };
    case 'readonly-kb':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'readonly-kb',
          message: `knowledge base "${resolved.kbName}" is marked readonly in kb.yaml; writes are refused`,
          details: { readonlyKbName: resolved.kbName, readonlyKbPath: resolved.kbPath },
        },
      };
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled resolveWritableKb failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Runs the read-only survey. A malformed `.kb/config.yaml` or `.kb/taxonomy.yaml` is a defect that the operator can
 * fix, so it returns as a structured `invalid-config`; any other throw is a system failure and propagates.
 */
async function runSurvey(input: { startDir: string; explicitKb: string | null; home?: string }): Promise<SurveyResult> {
  const resolved = await resolveKb({ ...input, requireWritable: false });
  if (!resolved.ok) {
    return resolved.failure;
  }

  try {
    const survey = await surveyKb({ kbPath: resolved.kb.path });
    return { ok: true, mode: 'survey', kb: resolved.kb, ...survey };
  } catch (error) {
    if (isKbLoaderError(error)) {
      return { ok: false, error: 'invalid-config', message: error.message };
    }
    throw error;
  }
}

// endregion | Helpers
