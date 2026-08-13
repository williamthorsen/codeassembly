/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@williamthorsen/kb';
import { resolveEventPath, resolveKbDir } from '@williamthorsen/kb/layout';
import { type ReadNote, readNote, writeNote } from '@williamthorsen/kb/note-io';
import { EVENT_IMPACT_LEVELS, isEventImpact, type KbEvent, parseEvent, renderEvent } from '@williamthorsen/kb/records';
import { loadAliases } from '@williamthorsen/kb/tags';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { formatMissingStoreMessage } from '../kb-shared/format-missing-store.ts';
import { isSafeEventId, splitCommaList } from '../kb-shared/note-helpers.ts';
import { resolveCaptureTarget, type ResolveCaptureTargetOutcome } from '../kb-shared/resolve-capture-target.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isMissingFile } from '../lib/type-guards.ts';
import { addAddressedBy } from './operations/add-addressed-by.ts';
import { retag } from './operations/retag.ts';
import { setImpact } from './operations/set-impact.ts';
import type { EventResult, ParsedArgs, UpdateFailure, UpdateResult } from './types.ts';

/** The value-bearing flags this helper accepts; positionals are the event ids the operation applies to. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'store', takesValue: true },
  { name: 'add-addressed-by', takesValue: true },
  { name: 'retag', takesValue: true },
  { name: 'set-impact', takesValue: true },
];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runUpdate({ argv: process.argv.slice(2) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-update-events: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end: parses args, resolves the target store by registry name (or the `@default` sentinel), and
 * applies the chosen operation to each event id independently. Each id resolves to `{store}/content/events/{id}.md`;
 * the event is read, parsed to a typed `KbEvent`, mutated, re-rendered through the per-type renderer, and written back
 * atomically. The per-type renderer emits only event fields, so an edit never injects the assertion-only `title`,
 * `created`, or `updated` onto an event. A recoverable per-event failure (invalid id, not found, unparseable) is
 * captured in that id's result and never aborts the others.
 *
 * Invocation-level failures (invalid args, an unresolvable or readonly store) become structured `{ ok: false, ... }`
 * results. System failures (out-of-disk, permission denied) propagate to the caller's try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runUpdate(input: { argv: readonly string[]; home?: string }): Promise<UpdateResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: describeError(error) };
  }

  const resolved = await resolveCaptureTarget({
    explicitName: args.store,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return resolutionFailure(resolved);
  }
  const store = resolved.store;

  // Aliases are only consulted by `retag`; `add-addressed-by` stores references verbatim, so skip the load for it.
  const aliases: AliasMap =
    args.operation === 'retag' ? await loadAliasesForStore(store.path) : new Map<string, string>();

  const results: EventResult[] = [];
  for (const id of args.ids) {
    results.push(await editOne({ storePath: store.path, id, args, aliases }));
  }

  return { ok: true, operation: args.operation, store: store.name, results };
}

/**
 * Parses the helper's argv. Layout: a required `--store`, exactly one operation flag (`--add-addressed-by`, `--retag`,
 * or `--set-impact`), and one or more positional event ids. Each value-bearing flag accepts both `--flag value` and
 * `--flag=value`; `--add-addressed-by` and `--retag` take a comma-separated list and `--set-impact` takes one declared
 * impact level. An unknown flag, more than one operation flag, none, no ids, an out-of-enum `--set-impact`, or a missing
 * required value throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals: ids, flags } = scanFlags(argv, FLAGS);
  const raw = valueFlagMap(flags);

  const store = raw.store === undefined ? null : raw.store;
  if (store === '') {
    throw new Error('--store requires a value');
  }

  const hasAddressedBy = raw['add-addressed-by'] !== undefined;
  const hasRetag = raw.retag !== undefined;
  const hasSetImpact = raw['set-impact'] !== undefined;
  const operationCount = [hasAddressedBy, hasRetag, hasSetImpact].filter(Boolean).length;
  if (operationCount > 1) {
    throw new Error(
      'operation flags are mutually exclusive; pass exactly one of --add-addressed-by, --retag, or --set-impact',
    );
  }
  if (operationCount === 0) {
    throw new Error('one operation flag is required (--add-addressed-by, --retag, or --set-impact)');
  }
  if (ids.length === 0) {
    throw new Error('at least one event id is required');
  }

  if (hasAddressedBy) {
    const references = splitCommaList(raw['add-addressed-by'] ?? '');
    if (references.length === 0) {
      throw new Error('--add-addressed-by requires at least one reference');
    }
    return { operation: 'add-addressed-by', store, ids, references };
  }
  if (hasRetag) {
    return { operation: 'retag', store, ids, tags: parseTagList(raw.retag ?? '') };
  }
  const impact = raw['set-impact'] ?? '';
  if (!isEventImpact(impact)) {
    throw new Error(`--set-impact must be one of ${EVENT_IMPACT_LEVELS.join(', ')}`);
  }
  return { operation: 'set-impact', store, ids, impact };
}

// region | Helpers

/** Applies the parsed operation to an event, returning the mutated record. Exhaustive over the operation union. */
function applyOperation(record: KbEvent, args: ParsedArgs, aliases: AliasMap): KbEvent {
  switch (args.operation) {
    case 'add-addressed-by':
      return addAddressedBy(record, args.references);
    case 'retag':
      return retag(record, args.tags, aliases);
    case 'set-impact':
      return setImpact(record, args.impact);
    default: {
      const _exhaustive: never = args;
      throw new Error(`unhandled operation: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Applies the operation to a single event id, mapping any recoverable failure onto a per-event result. Reads through
 * the note-io layer and parses to a typed `KbEvent`; a missing file, a frontmatter parse error, or a record that is not
 * a valid event each become a structured failure rather than a throw. The rendered output is re-parsed as a defensive
 * round-trip guard before the atomic write.
 */
async function editOne(input: {
  storePath: string;
  id: string;
  args: ParsedArgs;
  aliases: AliasMap;
}): Promise<EventResult> {
  const { storePath, id, args, aliases } = input;

  if (!isSafeEventId(id)) {
    return {
      ok: false,
      id,
      error: 'invalid-id',
      message: `event id "${id}" must be a bare filename stem (no path separators)`,
    };
  }

  const path = resolveEventPath({ storePath, id });

  let read: ReadNote;
  try {
    read = await readNote(path);
  } catch (error) {
    if (isMissingFile(error)) {
      return { ok: false, id, error: 'not-found', message: `no event at ${path}` };
    }
    throw error;
  }

  if (read.error !== undefined) {
    return { ok: false, id, error: 'parse', message: read.error };
  }

  const parsed = parseEvent(read.fields, read.body);
  if (!parsed.ok) {
    return { ok: false, id, error: 'parse', message: parsed.errors.join('; ') };
  }

  const updated = applyOperation(parsed.record, args, aliases);

  const rendered = renderEvent(updated);

  const reparsed = parseEvent(rendered.fields, rendered.body);
  if (!reparsed.ok) {
    return { ok: false, id, error: 'validation', message: reparsed.errors.join('; ') };
  }

  await writeNote(path, rendered.fields, rendered.body);
  return { ok: true, id, path };
}

/** Returns true when this module is the process entry point, resolving both sides through `realpathSync` so a symlinked invocation still matches. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-update-events: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/** Loads tag aliases for a store, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map with a warning. */
async function loadAliasesForStore(storePath: string): Promise<AliasMap> {
  const kbRoot: KbRoot = { path: storePath, kbDir: resolveKbDir(storePath) };
  try {
    return await loadAliases({ kbRoot });
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-update-events: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

/** Maps a store-resolution failure onto the helper's invocation-level failure result. */
function resolutionFailure(resolved: Extract<ResolveCaptureTargetOutcome, { ok: false }>): UpdateFailure {
  switch (resolved.reason) {
    case 'missing-store':
      return { ok: false, error: 'missing-store', message: formatMissingStoreMessage(resolved) };
    case 'not-registered':
      return {
        ok: false,
        error: 'store-not-registered',
        message:
          resolved.registryError !== undefined
            ? `could not load kb.yaml registry: ${resolved.registryError}`
            : `event store "${resolved.requestedName}" is not registered in kb.yaml`,
      };
    case 'readonly-store':
      return {
        ok: false,
        error: 'readonly-store',
        message: `event store "${resolved.name}" is marked readonly in kb.yaml; edits are refused`,
      };
    case 'no-default':
      return {
        ok: false,
        error: 'no-default-store',
        message:
          resolved.registryError !== undefined
            ? `could not resolve the default event store: ${resolved.registryError}`
            : '--store @default was given but no default_kb is configured in kb.yaml',
      };
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled resolveCaptureTarget failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// endregion | Helpers
