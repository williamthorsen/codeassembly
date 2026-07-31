/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { ulid } from 'ulid';

import { writeEvent } from '../capture-event/write-event.ts';
import { formatMissingStoreMessage } from '../kb-shared/format-missing-store.ts';
import { formatUtcTimestamp } from '../kb-shared/note-helpers.ts';
import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { resolveSession } from '../shared/resolve-session.ts';
import { prepareDecision } from './prepare-decision.ts';
import { resolveEpisode } from './resolve-episode.ts';
import { type DecisionResult, isLedeVerdict, LEDE_VERDICTS, type LedeVerdict } from './types.ts';

/** The flags this helper accepts; the comment comes from stdin, so it has no flag of its own. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'agent-lede-file', takesValue: true },
  { name: 'artifact-dir', takesValue: true },
  { name: 'data-dir', takesValue: true },
  { name: 'harness', takesValue: true },
  { name: 'inspect', takesValue: false },
  { name: 'manifest', takesValue: true },
  { name: 'merge-commit', takesValue: true },
  { name: 'merged-lede-file', takesValue: true },
  { name: 'pr', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'store', takesValue: true },
  { name: 'ticket', takesValue: true },
  { name: 'type', takesValue: true },
  { name: 'verdict', takesValue: true },
];

/** Parsed command-line invocation of the capture-lede-decision helper. */
export interface ParsedArgs {
  /** `inspect` resolves and reports the episode; `commit` records the author's verdict. */
  mode: 'inspect' | 'commit';
  /** The author's decision; `null` in inspect mode. */
  verdict: LedeVerdict | null;
  artifactDir: string;
  pr: string;
  mergeCommit: string;
  /** Directory holding `lede-voice.md` and `work-types.json`; `null` falls back to the helper's own `_data` sibling. */
  dataDir: string | null;
  store: string | null;
  type: string | null;
  scope: string | null;
  ticket: string | null;
  agentLedeFile: string | null;
  mergedLedeFile: string | null;
  manifest: string | null;
  harness: string | null;
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runDecision({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      cwd: process.cwd(),
      env: process.env,
      now: new Date(),
      defaultDataDir: resolveDefaultDataDir(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`capture-lede-decision: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end. In inspect mode it resolves the decision episode and reports it, writing nothing and
 * reading no stdin, so a caller can present both ledes before asking the author to decide. In commit mode it resolves
 * the same episode, reads the comment from stdin, and writes one event record to the named store.
 *
 * Every resolution failure and every store-resolution failure becomes a structured `{ ok: false, ... }` result, so a
 * caller invoking this after an irreversible merge can report one line and continue. System failures (out-of-disk,
 * permission denied) propagate to the caller's try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runDecision(input: {
  argv: readonly string[];
  stdin: Readable;
  cwd: string;
  env: NodeJS.ProcessEnv;
  now: Date;
  defaultDataDir: string;
  home?: string;
}): Promise<DecisionResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: error instanceof Error ? error.message : String(error) };
  }

  const resolved = await resolveEpisode({
    artifactDir: args.artifactDir,
    dataDir: args.dataDir ?? input.defaultDataDir,
    pr: args.pr,
    mergeCommit: args.mergeCommit,
    ...(args.type !== null && { type: args.type }),
    ...(args.scope !== null && { scope: args.scope }),
    ...(args.ticket !== null && { ticket: args.ticket }),
    ...(args.agentLedeFile !== null && { agentLedeFile: args.agentLedeFile }),
    ...(args.mergedLedeFile !== null && { mergedLedeFile: args.mergedLedeFile }),
    ...(args.manifest !== null && { manifestPath: args.manifest }),
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, message: resolved.message };
  }

  if (args.mode === 'inspect') {
    return { ok: true, mode: 'inspect', episode: resolved.episode };
  }

  const verdict = args.verdict;
  if (verdict === null) {
    return { ok: false, error: 'invalid-args', message: '--verdict is required to record a decision' };
  }

  const target = await resolveCaptureTarget({
    explicitName: args.store,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!target.ok) {
    return describeStoreFailure(target);
  }

  const comment = await readAll(input.stdin);
  const session = resolveSession(input.env);
  const repo = await resolveRepo(input.cwd);

  const prep = prepareDecision({
    episode: resolved.episode,
    verdict,
    comment,
    context: {
      cwd: input.cwd,
      ...(session !== undefined && { session }),
      ...(repo !== undefined && { repo }),
    },
    harness: args.harness,
    id: ulid(),
    capturedAt: formatUtcTimestamp(input.now),
  });
  if (!prep.ok) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `decision did not pass validation: ${prep.errors.join('; ')}`,
      errors: prep.errors,
    };
  }

  const recordPath = await writeEvent({
    storePath: target.store.path,
    id: prep.prepared.id,
    content: prep.prepared.content,
  });

  return {
    ok: true,
    mode: 'commit',
    verdict,
    id: prep.prepared.id,
    capturedAt: prep.prepared.capturedAt,
    path: recordPath,
    store: target.store.name,
  };
}

/**
 * Parses the helper's argv. `--inspect` and `--verdict` select the mode and are mutually exclusive; exactly one must
 * appear. `--artifact-dir`, `--pr`, and `--merge-commit` are always required, because a decision that cannot name the
 * change it describes is not worth recording. Every other flag is optional: the work type, scope, and ticket fall back
 * to the change-summary artifact, and the two lede overrides fall back to their artifacts.
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

  const { mode, verdict } = resolveMode({ inspect: flags.some((flag) => flag.name === 'inspect'), raw });

  return {
    mode,
    verdict,
    artifactDir: requireFlag(raw, 'artifact-dir'),
    pr: requireFlag(raw, 'pr'),
    mergeCommit: requireFlag(raw, 'merge-commit'),
    dataDir: raw['data-dir'] ?? null,
    store: raw.store ?? null,
    type: raw.type ?? null,
    scope: raw.scope ?? null,
    ticket: raw.ticket ?? null,
    agentLedeFile: raw['agent-lede-file'] ?? null,
    mergedLedeFile: raw['merged-lede-file'] ?? null,
    manifest: raw.manifest ?? null,
    harness: raw.harness ?? null,
  };
}

// region | Helpers

/** Maps a store-resolution failure onto the helper's structured result, preserving the resolver's categorical reason. */
function describeStoreFailure(
  resolved: Extract<Awaited<ReturnType<typeof resolveCaptureTarget>>, { ok: false }>,
): DecisionResult {
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
        message: `event store "${resolved.name}" is marked readonly in kb.yaml; decisions are refused`,
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

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`, matching the degrade-with-warning pattern the sibling helpers use.
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
    process.stderr.write(`capture-lede-decision: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/** Resolves the `_data` directory shipped beside the installed helper, holding the doctrine and the work-type taxonomy. */
function resolveDefaultDataDir(): string {
  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(helperDir, '..', '_data');
}

/**
 * Resolves which mode the invocation selects, rejecting an argv that names both or neither. Exactly one of `--inspect`
 * and `--verdict` must appear, so the mode and the verdict are decided together rather than validated separately.
 */
function resolveMode(input: { inspect: boolean; raw: Record<string, string> }): {
  mode: 'inspect' | 'commit';
  verdict: LedeVerdict | null;
} {
  const rawVerdict = input.raw.verdict;
  if (rawVerdict !== undefined && input.inspect) {
    throw new Error('--inspect and --verdict are mutually exclusive');
  }
  if (rawVerdict === undefined && !input.inspect) {
    throw new Error(`one of --inspect or --verdict <${LEDE_VERDICTS.join('|')}> is required`);
  }
  if (rawVerdict !== undefined && !isLedeVerdict(rawVerdict)) {
    throw new Error(`--verdict must be one of ${LEDE_VERDICTS.join(', ')}`);
  }
  return input.inspect ? { mode: 'inspect', verdict: null } : { mode: 'commit', verdict: rawVerdict ?? null };
}

/** Reads a required value-bearing flag, throwing a usage-style message when it is absent. */
function requireFlag(raw: Record<string, string>, name: string): string {
  const value = raw[name];
  if (value === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

// endregion | Helpers
