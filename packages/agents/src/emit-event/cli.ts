/**
 * CLI entry for the lifecycle-event emitter. Composes one lifecycle event from the flags, the environment, and git at
 * `cwd`, then appends it to the session's JSONL log.
 *
 * Every exit is 0, failures included, because a lost event must not derail the skill that emitted it.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { EVENT_TYPES, isEventType } from 'codeassembly-lifecycle';
import { ulid } from 'ulid';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isRecord } from '../lib/type-guards.ts';
import { resolveCurrentBranch } from '../shared/branch-helpers.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { resolveSession } from '../shared/resolve-session.ts';
import { composeEnvelope } from './compose-envelope.ts';
import { resolveEventPath } from './resolve-event-path.ts';
import type { EmitContext, EmitErrorCode, EmitFailure, EmitResult, ParsedArgs } from './types.ts';
import { appendEvent } from './write-event.ts';

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
    // `runEmit` converts every failure that it anticipates into a structured result, so reaching here means something
    // unforeseen threw.
    result = failure('internal-error', describeError(error));
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the helper end to end, from the invocation's argv to the appended event. The helper warns on an undeclared
 * `--type` and appends the event regardless, so that the v0 vocabulary never blocks an emission.
 *
 * Every failure is recoverable by contract, and each returns `{ ok: false, ... }` having written nothing.
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
    return failure('invalid-args', describeError(error));
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
    const message = describeError(error);
    return failure('write-failed', `could not append the event to ${filePath}: ${message}`);
  }

  return { ok: true, id: envelope.id, path: filePath };
}

/**
 * Parses the helper's argv, throwing on any defect in it. The caller turns the throw into an `invalid-args` result.
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

/** Resolves the envelope's auto-filled context from git at `cwd`, the environment, and the flags. */
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
    warn(`${describeError(error)}; omitting the branch`);
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
 * The payload must be a JSON object, because its shape is the per-family contract that consumers read.
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
    const message = describeError(error);
    return { ok: false, message: `--payload is not valid JSON: ${message}` };
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: `--payload must be a JSON object, got: ${raw}` };
  }
  return { ok: true, value: parsed };
}

/** Builds a failure result and warns on stderr, so that an operator sees the failure. */
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
 * symlinked invocation path still matches. A `realpathSync` failure warns and returns `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    warn(`could not determine entry point: ${describeError(error)}`);
    return false;
  }
}

// endregion | Helpers
