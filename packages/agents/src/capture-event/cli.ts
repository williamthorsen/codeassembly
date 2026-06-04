/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { KbRoot } from '@codeassembly/kb-core';
import { loadSchema } from '@codeassembly/kb-core/schema';
import { ulid } from 'ulid';

import { resolveStoreByName } from '../kb-shared/resolve-store-by-name.ts';
import { prepareEvent } from './prepare-event.ts';
import type { CaptureContext, CaptureResult, ParsedArgs } from './types.ts';
import { writeEvent } from './write-event.ts';

const execFileAsync = promisify(execFile);

/** The default event store; capture always routes by registry name and never walks the working directory. */
const DEFAULT_STORE = 'codeassembly';

/** Flag names that take a value. */
const VALUE_FLAGS = ['store', 'type', 'summary', 'skill', 'model', 'tags', 'correction'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

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

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end: parses args, reads the event body from stdin, resolves the target store by registry
 * name, loads its kind-aware schema, fills in the auto-derived context (ULID `id`, `captured-at`, `session`, `cwd`,
 * best-effort `repo`), validates the per-type required set, and writes `events/{id}.md` immutably.
 *
 * Recoverable failures (invalid args, unregistered or readonly store, schema validation) become structured
 * `{ ok: false, ... }` results. System failures (out-of-disk, permission denied) propagate to the caller's try/catch.
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

  const resolved = await resolveStoreByName({
    name: args.store,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    switch (resolved.reason) {
      case 'not-registered':
        return {
          ok: false,
          error: 'store-not-registered',
          message: `event store "${resolved.requestedName}" is not registered in kb.yaml`,
        };
      case 'readonly-store':
        return {
          ok: false,
          error: 'readonly-store',
          message: `event store "${resolved.name}" is marked readonly in kb.yaml; captures are refused`,
        };
      default: {
        const _exhaustive: never = resolved;
        throw new Error(`unhandled resolveStoreByName failure: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  const store = resolved.store;

  const kbRoot: KbRoot = { path: store.path, kbDir: join(store.path, '.kb'), via: 'ancestor-walk' };
  const schema = await loadSchema({ kbRoot });

  const session = input.env.CLAUDE_CODE_SESSION_ID ?? '';
  const repo = await resolveRepo(input.cwd);
  const context: CaptureContext = { session, cwd: input.cwd, ...(repo !== undefined && { repo }) };

  const body = await readAll(input.stdin);

  const prep = prepareEvent({
    args,
    context,
    id: ulid(),
    capturedAt: input.now.toISOString(),
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
 * comma-separated list. Unknown flags or missing required values throw with a usage-style message. The body comes from
 * stdin rather than the command line, so the layout is flag-only.
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

  const type = raw.type;
  if (type === undefined) {
    throw new Error('--type is required');
  }
  const summary = raw.summary;
  if (summary === undefined) {
    throw new Error('--summary is required');
  }

  return {
    store: raw.store ?? DEFAULT_STORE,
    type,
    summary,
    skill: raw.skill ?? null,
    model: raw.model ?? null,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
    correction: raw.correction ?? null,
  };
}

// region | Helpers

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

/** Matches a value-bearing flag, returning its key and any inline `=value`. */
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

/** Splits a comma-separated tag string into individual tags, dropping empties and trimming whitespace. */
function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
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

/** Reads the preferred remote's fetch URL via `git remote`, preferring `origin`. Returns `undefined` on any failure. */
async function resolveRemoteUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout: remotes } = await execFileAsync('git', ['-C', cwd, 'remote']);
    const names = remotes
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (names.length === 0) {
      return undefined;
    }
    const preferred = names.includes('origin') ? 'origin' : names[0];
    if (preferred === undefined) {
      return undefined;
    }
    const { stdout: url } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', preferred]);
    const trimmed = url.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Normalizes an SSH or HTTPS git remote URL to `owner/name`, or `undefined` when it cannot be parsed. */
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

/** Reads a readable stream to completion as a UTF-8 string. */
async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('readAll: expected Buffer chunks (stream must be in binary mode)');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// endregion | Helpers
