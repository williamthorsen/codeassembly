/**
 * CLI entry for the lifecycle-event emitter.
 *
 * - Autofills the envelope's context: `repo` and `branch` from git at `cwd`, `session` from `--session` or the
 *   harness's session variable, `cwd` from the process, `harness` from the install-injected flag.
 * - Appends one JSON line to `{home}/.codeassembly/events/{owner}/{name}/{sanitized-branch}/{session}.jsonl`.
 * - Never blocks the skill it observes: every failure — bad arguments, an unusable payload, a failed write, an
 *   unexpected throw — prints a structured `{ ok: false, error, message }` to stdout, warns on stderr, and exits 0.
 *   A success prints `{ ok: true, id, path }`. There is no non-zero exit path.
 *
 * Flags:
 *   --type <name>        The event type. Required. An undeclared type warns and is appended anyway.
 *   --payload <json>     A JSON object carrying the per-family event body. Defaults to `{}`.
 *   --session <id>       Session id overriding the environment-derived one, for a harness that relays it out of band.
 *   --harness <id>       The agent platform; install-injected, not derived at runtime.
 *   --home <path>        Events-root override, so a test can point the write at a fixture directory.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EVENT_TYPES, isEventType } from 'codeassembly-lifecycle';
import { ulid } from 'ulid';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isRecord } from '../lib/type-guards.ts';
import { resolveCurrentBranch } from '../shared/branch-helpers.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { resolveSession } from '../shared/resolve-session.ts';
import { composeEnvelope } from './compose-envelope.ts';
import { resolveEventPath } from './resolve-event-path.ts';
import { type EmitContext, type EmitErrorCode, type EmitFailure, type EmitResult, type ParsedArgs } from './types.ts';
import { appendEvent } from './write-event.ts';

/** The flags this helper accepts. Every one takes a value; the event body arrives inline via `--payload`, not stdin. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'type', takesValue: true },
  { name: 'payload', takesValue: true },
  { name: 'session', takesValue: true },
  { name: 'harness', takesValue: true },
  { name: 'home', takesValue: true },
];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. Always exits 0. */
async function main(): Promise<void> {
  let result: EmitResult;
  try {
    result = await runEmit({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      env: process.env,
      now: new Date(),
    });
  } catch (error) {
    // The never-block backstop. `runEmit` converts every failure it anticipates into a structured result, so reaching
    // here means something unforeseen threw — which still must not take down the skill being observed.
    result = failure('internal-error', error instanceof Error ? error.message : String(error));
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end: parses args, validates the payload, resolves the context git and the environment supply,
 * composes the envelope, and appends it to the session's JSONL log. An undeclared `--type` warns and is appended
 * regardless, so a skill can emit a type the v0 vocabulary has not caught up with.
 *
 * Every failure is recoverable by contract. Invalid args, an unparseable or non-object payload, and a failed write all
 * return `{ ok: false, ... }` without writing anything, leaving the calling skill to carry on unaffected.
 *
 * @internal - Exported to allow testing.
 */
export async function runEmit(input: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: Date;
}): Promise<EmitResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return failure('invalid-args', error instanceof Error ? error.message : String(error));
  }

  const payload = parsePayload(args.payload);
  if (!payload.ok) {
    return failure('invalid-payload', payload.message);
  }

  if (!isEventType(args.type)) {
    warn(`unknown event type "${args.type}"; appending it anyway. Declared types: ${EVENT_TYPES.join(', ')}`);
  }

  const context = await resolveContext({ args, cwd: input.cwd, env: input.env });
  const envelope = composeEnvelope({
    id: ulid(),
    now: input.now,
    type: args.type,
    context,
    payload: payload.value,
  });
  const filePath = resolveEventPath({
    home: args.home ?? homedir(),
    ...(context.repo !== undefined && { repo: context.repo }),
    ...(context.branch !== undefined && { branch: context.branch }),
    ...(context.session !== undefined && { session: context.session }),
  });

  try {
    await appendEvent({ filePath, envelope });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure('write-failed', `could not append the event to ${filePath}: ${message}`);
  }

  return { ok: true, id: envelope.id, path: filePath };
}

/**
 * Parses the helper's argv. Each flag accepts both `--flag value` and `--flag=value`. An unknown flag, an unexpected
 * positional, an empty value, or a missing `--type` throws; the caller turns that into an `invalid-args` result.
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

  const type = raw.type;
  if (type === undefined) {
    throw new Error('--type is required');
  }

  return {
    type,
    payload: raw.payload ?? null,
    session: raw.session ?? null,
    harness: raw.harness ?? null,
    home: raw.home ?? null,
  };
}

// region | Helpers

/**
 * Resolves the context the envelope carries beyond the agent-supplied fields. Each field is best-effort: an
 * unresolvable one is omitted from the envelope and stands in as a placeholder path segment, never a failure.
 *
 * `--session` wins over the environment so a harness that runs the helper outside the agent's own process — the Rovo
 * relay — can still attribute the event to the session that produced it.
 */
async function resolveContext(input: { args: ParsedArgs; cwd: string; env: NodeJS.ProcessEnv }): Promise<EmitContext> {
  // The repo and branch reads are independent, and the repo read is itself two chained git invocations. Overlapping
  // them keeps the emission's git cost to the longer chain rather than the sum, on a helper the agent blocks on at
  // every lifecycle boundary.
  const [repo, branch] = await Promise.all([resolveRepo(input.cwd), resolveBranch(input.cwd)]);
  const session = input.args.session ?? resolveSession(input.env);

  return {
    ...(repo !== undefined && { repo }),
    ...(branch !== undefined && { branch }),
    ...(session !== undefined && { session }),
    cwd: input.cwd,
    ...(input.args.harness !== null && { harness: input.args.harness }),
  };
}

/**
 * The checked-out branch at `cwd`, or `undefined` when there is none to read: git cannot answer (no repository, no git
 * binary) or HEAD is detached, which git reports as an empty branch name. Both warn, because an emitter that silently
 * files every event under the no-branch placeholder is indistinguishable from one that is working.
 */
async function resolveBranch(cwd: string): Promise<string | undefined> {
  let branch: string;
  try {
    branch = await resolveCurrentBranch(cwd);
  } catch (error) {
    warn(`${error instanceof Error ? error.message : String(error)}; omitting the branch`);
    return undefined;
  }
  if (branch === '') {
    warn('HEAD is detached; omitting the branch');
    return undefined;
  }
  return branch;
}

/**
 * Parses the raw `--payload` text into the envelope's payload object; an omitted flag yields `{}`.
 *
 * Anything that is not a JSON object — malformed JSON, or a valid array, string, or `null` — fails the emission rather
 * than being coerced into a wrapper object. The payload's shape is the per-family contract consumers read, so a
 * silently reshaped payload is worse than a refused event the caller is told about.
 */
function parsePayload(
  raw: string | null,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (raw === null) {
    return { ok: true, value: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `--payload is not valid JSON: ${message}` };
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: `--payload must be a JSON object, got: ${raw}` };
  }
  return { ok: true, value: parsed };
}

/** Builds a failure result, warning on stderr so the failure is visible to an operator and not only to the caller. */
function failure(error: EmitErrorCode, message: string): EmitFailure {
  warn(message);
  return { ok: false, error, message };
}

/** Writes one diagnostic line to stderr. Stdout carries the machine-readable result, so it stays clean. */
function warn(message: string): void {
  process.stderr.write(`emit-event: warning: ${message}\n`);
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`, matching the degrade-with-warning pattern used by `capture-event`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    warn(`could not determine entry point: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// endregion | Helpers
