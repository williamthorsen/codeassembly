/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { resolveEventPath } from '@williamthorsen/kb/layout';
import { type ReadNote, readNote, writeNote } from '@williamthorsen/kb/note-io';
import {
  EVENT_IMPACT_LEVELS,
  type EventImpact,
  isEventImpact,
  type KbEvent,
  parseEvent,
  renderEvent,
} from '@williamthorsen/kb/records';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { ulid } from 'ulid';

import { formatMissingStoreMessage } from '../kb-shared/format-missing-store.ts';
import { formatUtcTimestamp, isSafeEventId } from '../kb-shared/note-helpers.ts';
import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { isEnoent } from '../lib/type-guards.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { resolveSession } from '../shared/resolve-session.ts';
import { prepareEvent } from './prepare-event.ts';
import type { CaptureContext, CaptureResult, ParsedArgs } from './types.ts';
import { writeEvent } from './write-event.ts';

const FLAGS: readonly FlagSpec[] = [
  { name: 'store', takesValue: true },
  { name: 'summary', takesValue: true },
  { name: 'skill', takesValue: true },
  { name: 'model', takesValue: true },
  { name: 'harness', takesValue: true },
  { name: 'tags', takesValue: true },
  { name: 'impact', takesValue: true },
  { name: 'amend', takesValue: true },
];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runCapture({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      cwd: process.cwd(),
      env: process.env,
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`capture-event: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end, from the invocation's argv and stdin to the written event.
 *
 * On a recoverable failure, the function returns `{ ok: false, error, message }` having written nothing. A system
 * failure (out of disk, permission denied) propagates instead, for `main` to report on stderr before exiting non-zero.
 *
 * @internal - Exported to allow testing.
 */
export async function runCapture(input: {
  argv: readonly string[];
  stdin: Readable;
  cwd: string;
  env: NodeJS.ProcessEnv;
  now: Date;
  home?: string;
}): Promise<CaptureResult> {
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
          message: `event store "${resolved.name}" is marked readonly in kb.yaml; captures are refused`,
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
  const store = resolved.store;

  const body = await readAll(input.stdin);

  if (args.amend !== null) {
    return amendEvent({ args, store, body });
  }

  const session = resolveSession(input.env);
  const repo = await resolveRepo(input.cwd);
  const context: CaptureContext = {
    cwd: input.cwd,
    ...(session !== undefined && { session }),
    ...(repo !== undefined && { repo }),
  };

  const prep = prepareEvent({
    args,
    context,
    id: ulid(),
    capturedAt: formatUtcTimestamp(input.now),
    body,
  });
  if (!prep.ok) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `event did not pass validation: ${prep.errors.join('; ')}`,
      errors: prep.errors,
    };
  }

  const path = await writeEvent({ storePath: store.path, id: prep.prepared.id, content: prep.prepared.content });

  return { ok: true, id: prep.prepared.id, capturedAt: prep.prepared.capturedAt, path, store: store.name };
}

/**
 * Parses the helper's argv, throwing on any defect in it. The caller turns the throw into an `invalid-args` result.
 * The event body comes from stdin rather than the command line, so the layout is flag-only.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  const raw = valueFlagMap(flags);
  for (const [name, value] of Object.entries(raw)) {
    if (value === '') {
      throw new Error(`--${name} requires a value`);
    }
  }

  const summary = raw.summary;
  if (summary === undefined) {
    throw new Error('--summary is required');
  }

  let impact: EventImpact | null = null;
  if (raw.impact !== undefined) {
    if (!isEventImpact(raw.impact)) {
      throw new Error(`--impact must be one of ${EVENT_IMPACT_LEVELS.join(', ')}`);
    }
    impact = raw.impact;
  }

  const amend = raw.amend ?? null;
  if (amend !== null && !isSafeEventId(amend)) {
    throw new Error(`--amend id "${amend}" must be a bare filename stem (no path separators)`);
  }

  return {
    store: raw.store ?? null,
    summary,
    skill: raw.skill ?? null,
    model: raw.model ?? null,
    harness: raw.harness ?? null,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
    impact,
    amend,
  };
}

// region | Helpers

/**
 * Amends an existing event in place. The filename id is authoritative, so a corrupted frontmatter id cannot redirect
 * the write.
 */
async function amendEvent(input: {
  args: ParsedArgs;
  store: { name: string; path: string };
  body: string;
}): Promise<CaptureResult> {
  const { args, store, body } = input;
  const id = args.amend;
  if (id === null) {
    throw new Error('amendEvent called without an --amend id');
  }

  const eventPath = resolveEventPath({ storePath: store.path, id });

  let read: ReadNote;
  try {
    read = await readNote(eventPath);
  } catch (error) {
    if (isEnoent(error)) {
      return { ok: false, error: 'amend-not-found', message: `no event to amend at ${eventPath}` };
    }
    throw error;
  }
  if (read.error !== undefined) {
    return { ok: false, error: 'amend-parse', message: `event at ${eventPath} is not a valid note: ${read.error}` };
  }

  const parsed = parseEvent(read.fields, read.body);
  if (!parsed.ok) {
    return {
      ok: false,
      error: 'amend-parse',
      message: `event at ${eventPath} is not a valid event: ${parsed.errors.join('; ')}`,
    };
  }

  const updated = amendRecord(parsed.record, args, body);
  const rendered = renderEvent(updated);

  const reparsed = parseEvent(rendered.fields, rendered.body);
  if (!reparsed.ok) {
    return {
      ok: false,
      error: 'amend-parse',
      message: `amended event failed validation: ${reparsed.errors.join('; ')}`,
    };
  }

  await writeNote(eventPath, rendered.fields, rendered.body);
  return { ok: true, id, capturedAt: parsed.record.capturedAt, path: eventPath, store: store.name };
}

/**
 * Applies an amend to a parsed event: The invocation supplies `summary` and `body`, and overrides
 * `skill`/`model`/`tags`/`impact` only when it supplies them. Clearing a curatorial field belongs to its own mutator
 * in `kb-update-events`, so an omitted flag keeps the existing value.
 */
function amendRecord(existing: KbEvent, args: ParsedArgs, body: string): KbEvent {
  const extra = { ...existing.extra };
  if (args.skill !== null) {
    extra.skill = args.skill;
  }
  if (args.model !== null) {
    extra.model = args.model;
  }
  return {
    ...existing,
    summary: args.summary,
    body,
    tags: args.tags.length > 0 ? args.tags : existing.tags,
    ...(args.impact !== null && { impact: args.impact }),
    extra,
  };
}

/**
 * Returns true when this module is the process entry point. Because both sides are resolved through `realpathSync`, a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`.
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
    process.stderr.write(`capture-event: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
