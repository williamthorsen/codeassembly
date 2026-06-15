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
import { loadSchema } from '@codeassembly/kb/schema';
import { ulid } from 'ulid';

import { formatUtcTimestamp } from '../kb-shared/note-helpers.ts';
import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { isEnoent } from '../lib/type-guards.ts';
import { prepareEvent } from './prepare-event.ts';
import type { CaptureContext, CaptureResult, ParsedArgs } from './types.ts';
import { writeEvent } from './write-event.ts';

const execFileAsync = promisify(execFile);

/** Flag names that take a value. */
const VALUE_FLAGS = ['store', 'summary', 'skill', 'model', 'tags'] as const;
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

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end: parses args, reads the event body from stdin, resolves the target store (an explicit
 * `--store` by name, else the registry's `default_kb`), loads its schema, fills in the auto-derived context (ULID
 * `id`, `captured-at`, `session`, `cwd`, best-effort `repo`), validates the event record type's required spine, and
 * writes `content/events/{id}.md` immutably.
 *
 * Recoverable failures (invalid args, an unregistered/readonly store, no configured default, schema validation)
 * become structured `{ ok: false, ... }` results. System failures (out-of-disk, permission denied) propagate to the
 * caller's try/catch.
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
              ? `could not resolve a default event store: ${resolved.registryError}`
              : 'no --store was given and no default_kb is configured in kb.yaml',
        };
      default: {
        const _exhaustive: never = resolved;
        throw new Error(`unhandled resolveCaptureTarget failure: ${JSON.stringify(_exhaustive)}`);
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

  const summary = raw.summary;
  if (summary === undefined) {
    throw new Error('--summary is required');
  }

  return {
    store: raw.store ?? null,
    summary,
    skill: raw.skill ?? null,
    model: raw.model ?? null,
    tags: raw.tags === undefined ? [] : parseTagList(raw.tags),
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
