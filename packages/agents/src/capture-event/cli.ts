/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { KbRoot } from '@codeassembly/kb';
import { type ReadNote, readNote, writeNote } from '@codeassembly/kb/note-io';
import {
  EVENT_IMPACT_LEVELS,
  type EventImpact,
  isEventImpact,
  type KbEvent,
  parseEvent,
  renderEvent,
} from '@codeassembly/kb/records';
import { loadSchema } from '@codeassembly/kb/schema';
import { ulid } from 'ulid';

import { formatUtcTimestamp, isSafeEventId } from '../kb-shared/note-helpers.ts';
import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { isEnoent } from '../lib/type-guards.ts';
import { isEventPushed } from './event-push-state.ts';
import { prepareEvent } from './prepare-event.ts';
import type { CaptureContext, CaptureResult, ParsedArgs } from './types.ts';
import { writeEvent } from './write-event.ts';

const execFileAsync = promisify(execFile);

/** The value-bearing flags this helper accepts; the body comes from stdin, so the layout is flag-only. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'store', takesValue: true },
  { name: 'summary', takesValue: true },
  { name: 'skill', takesValue: true },
  { name: 'model', takesValue: true },
  { name: 'harness', takesValue: true },
  { name: 'tags', takesValue: true },
  { name: 'impact', takesValue: true },
  { name: 'amend', takesValue: true },
  { name: 'allow-pushed', takesValue: false },
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`capture-event: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end: parses args, reads the event body from stdin, and resolves the target store (a concrete
 * `--store` by name, or the registry's `default_kb` via the `@default` sentinel; an omitted `--store` is refused). A
 * fresh capture loads the store schema, fills in the auto-derived context (ULID `id`, `captured-at`, `session`, `cwd`,
 * best-effort `repo`), validates the event record type's required spine, and writes `content/events/{id}.md` without
 * overwriting an existing id. With `--amend <id>`, it instead rewrites that existing event in place; see
 * {@link amendEvent}.
 *
 * Recoverable failures (invalid args, an omitted `--store`, an unregistered/readonly store, no configured default,
 * schema validation, and the amend-specific not-found/parse/pushed cases) become structured `{ ok: false, ... }`
 * results. System failures (out-of-disk, permission denied) propagate to the caller's try/catch.
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
    return { ok: false, error: 'invalid-args', message: error instanceof Error ? error.message : String(error) };
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

  const kbRoot: KbRoot = { path: store.path, kbDir: join(store.path, '.kb'), via: 'ancestor-walk' };
  const schema = await loadSchema({ kbRoot });
  const session = input.env.CLAUDE_CODE_SESSION_ID ?? '';
  const repo = await resolveRepo(input.cwd);
  const context: CaptureContext = { session, cwd: input.cwd, ...(repo !== undefined && { repo }) };

  const prep = prepareEvent({
    args,
    context,
    id: ulid(),
    capturedAt: formatUtcTimestamp(input.now),
    schema,
    body,
  });
  if (!prep.ok) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `event did not pass schema validation: ${prep.findings.map((finding) => finding.message).join('; ')}`,
      findings: prep.findings,
    };
  }

  const path = await writeEvent({ storePath: store.path, id: prep.prepared.id, content: prep.prepared.content });

  return { ok: true, id: prep.prepared.id, capturedAt: prep.prepared.capturedAt, path, store: store.name };
}

/**
 * Parses the helper's argv. Each value-bearing flag accepts both `--flag value` and `--flag=value`; `--tags` accepts a
 * comma-separated list, `--impact` accepts one declared impact level, and `--allow-pushed` is a boolean flag. Unknown
 * flags, an unexpected positional, an empty value for any value-bearing flag, a missing `--summary`, an out-of-enum
 * `--impact`, or an `--amend` id that is not a bare filename stem throw with a usage-style message. The body comes from
 * stdin rather than the command line, so the layout is flag-only.
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
    allowPushed: flags.some((flag) => flag.name === 'allow-pushed'),
  };
}

// region | Helpers

/**
 * Amends an existing event in place. It rewrites `summary` and the body from the invocation and overrides
 * `skill`/`model`/`tags`/`impact` only when they are supplied, preserving everything else: provenance (`id`,
 * `captured-at`, `session`, `cwd`, `repo`, `harness`), `addressed-by`, and any curatorial field the caller did not
 * restate. The overwrite is refused when the event is already pushed to the store's remote unless `--allow-pushed` was
 * given, so a pushed event stays immutable while an unpushed one remains editable. The filename id is authoritative, so
 * a corrupted frontmatter id cannot redirect the write. A missing or unparseable target becomes a structured
 * `amend-not-found`/`amend-parse` result.
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

  const eventPath = join(store.path, 'content', 'events', `${id}.md`);

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

  if (!args.allowPushed && (await isEventPushed({ storePath: store.path, id }))) {
    return {
      ok: false,
      error: 'event-pushed',
      message: `event ${id} is already pushed to the remote; re-run with --allow-pushed to amend it anyway, or capture a new event instead`,
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
 * Applies an amend to a parsed event: `summary` and `body` come from the invocation; `skill`/`model` (stored in
 * `extra`) and `tags`/`impact` are overridden only when supplied; provenance and `addressed-by` are preserved. Clearing
 * a curatorial field is a job for its own mutator in `kb-update-events`, not for an amend, so an omitted flag keeps the
 * existing value rather than dropping it.
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
 * Builds the agent-facing error message for an omitted `--store`, naming the registered stores and, when configured,
 * the registry default reachable as `--store @default`.
 */
function formatMissingStoreMessage(resolved: {
  registeredStores: string[];
  defaultName?: string;
  registryError?: string;
}): string {
  if (resolved.registryError !== undefined) {
    return `--store is required, but the kb.yaml registry could not be loaded: ${resolved.registryError}`;
  }
  if (resolved.registeredStores.length === 0) {
    return '--store is required, but no stores are registered in kb.yaml';
  }
  const stores = resolved.registeredStores.join(', ');
  const defaultHint =
    resolved.defaultName !== undefined
      ? `the registry default is "${resolved.defaultName}", reachable as --store @default`
      : 'no default_kb is configured';
  return `--store is required. Registered stores: ${stores}. Pass --store <name> to choose one; ${defaultHint}.`;
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`, matching the degrade-with-warning pattern used by `kb-add`.
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
    process.stderr.write(`capture-event: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/**
 * Resolves the `owner/name` git remote at `cwd`, best-effort. Prefers the `origin` remote and falls back to the first
 * listed remote when `origin` is absent. Both SSH (`git@host:owner/name.git`) and HTTPS (`https://host/owner/name.git`)
 * URL forms are parsed, the `.git` suffix is stripped, and the result is normalized to `owner/name`. Any failure (no
 * remote, unparseable URL) returns `undefined` so the capture is never blocked.
 */
async function resolveRepo(cwd: string): Promise<string | undefined> {
  const url = await resolveRemoteUrl(cwd);
  if (url === undefined) {
    return undefined;
  }
  return normalizeRemoteUrl(url);
}

/**
 * Reads the preferred remote's fetch URL via `git remote`, preferring `origin` and falling back to the first listed
 * remote. Returns `undefined` for the expected best-effort cases (no remote, unparseable URL, non-git directory). When
 * the `git` binary itself is unavailable (`ENOENT`), it emits a one-line warning before returning `undefined`, so a
 * broken environment is distinguished from an absent remote rather than silently suppressed.
 */
async function resolveRemoteUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout: remotes } = await execFileAsync('git', ['-C', cwd, 'remote']);
    const [first, ...rest] = remotes
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (first === undefined) {
      return undefined;
    }
    const preferred = [first, ...rest].includes('origin') ? 'origin' : first;
    const { stdout: url } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', preferred]);
    const trimmed = url.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    if (isEnoent(error)) {
      process.stderr.write('capture-event: warning: git is not available; omitting repo from the event\n');
    }
    return undefined;
  }
}

/**
 * Normalizes an SSH or HTTPS git remote URL to `owner/name`, or `undefined` when it cannot be parsed.
 *
 * @internal - Exported to allow testing.
 */
export function normalizeRemoteUrl(url: string): string | undefined {
  const withoutSuffix = url.replace(/\.git$/, '');

  const sshMatch = /^[^@]+@[^:]+:(?<path>.+)$/.exec(withoutSuffix);
  if (sshMatch?.groups?.path !== undefined) {
    return takeOwnerName(sshMatch.groups.path);
  }

  const httpsMatch = /^https?:\/\/[^/]+\/(?<path>.+)$/.exec(withoutSuffix);
  if (httpsMatch?.groups?.path !== undefined) {
    return takeOwnerName(httpsMatch.groups.path);
  }

  return undefined;
}

/** Reduces a remote path (which may carry extra subgroups) to its last two `owner/name` segments. */
function takeOwnerName(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return undefined;
  }
  return segments.slice(-2).join('/');
}

// endregion | Helpers
