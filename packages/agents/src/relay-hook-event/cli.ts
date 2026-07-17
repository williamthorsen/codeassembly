/**
 * CLI entry for the harness hook relay.
 *
 * A harness's event hooks fire at boundaries no skill is running to observe — a session ends, a turn completes — so the
 * hook, not the agent, is what reports them. Configured as a hook command, this relay reads the hook's JSON payload on
 * stdin, maps `{harness, hook}` to a lifecycle event type, and appends the event attributed to the session and working
 * directory the payload names.
 *
 * The hook's identity comes from the flags, never from stdin: the two harnesses' payload shapes differ, so stdin
 * supplies only data and the flags — baked in when the hook entry is configured — supply the mapping key.
 *
 * Never blocks the session it observes: every failure — bad flags, an unusable payload, an unknown hook, a failed
 * write, an unexpected throw — prints a structured `{ ok: false, error, message }` to stdout, warns on stderr, and
 * exits 0. A success prints `{ ok: true, id, path }`. There is no non-zero exit path, because Claude Code reads some
 * non-zero hook exits as control signals rather than as failures.
 *
 * Flags:
 *   --harness <id>   The harness whose hook fired (`claude`, `rovodev`). Required.
 *   --hook <name>    The harness's own name for the hook, e.g. `SessionStart`. Required.
 *   --home <path>    Events-root override, so a test can point the write at a fixture directory.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

import { ulid } from 'ulid';

import { composeEnvelope } from '../emit-event/compose-envelope.ts';
import { resolveEventPath } from '../emit-event/resolve-event-path.ts';
import { appendEvent } from '../emit-event/write-event.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isRecord } from '../lib/type-guards.ts';
import { resolveCurrentBranch } from '../shared/branch-helpers.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { resolveSession } from '../shared/resolve-session.ts';
import { isRelayHarness, listRelayHarnesses, resolveHookMapping } from './hook-mappings.ts';
import type { HookMapping, HookPayload, ParsedArgs, RelayErrorCode, RelayFailure, RelayResult } from './types.ts';

/** The flags this relay accepts. Every one takes a value; the hook's data arrives on stdin, never as a flag. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'harness', takesValue: true },
  { name: 'hook', takesValue: true },
  { name: 'home', takesValue: true },
];

/** The payload key each harness reports the session's id under. */
const SESSION_KEY = 'session_id';

/** The payload key each harness reports the session's working directory under. */
const CWD_KEY = 'cwd';

/** Executes the relay from `process.argv` and stdin, writing the JSON result to stdout. Always exits 0. */
async function main(): Promise<void> {
  let result: RelayResult;
  try {
    result = await runRelay({
      argv: process.argv.slice(2),
      stdin: await readStdin(),
      cwd: process.cwd(),
      env: process.env,
      now: new Date(),
    });
  } catch (error) {
    // The never-block backstop. `runRelay` converts every failure it anticipates into a structured result, so reaching
    // here means something unforeseen threw — which still must not disturb the session being observed.
    result = failure('internal-error', error instanceof Error ? error.message : String(error));
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the relay end to end: parses the flags, looks the hook up in its harness's mapping, reads the payload, resolves
 * the event's context against the working directory the payload names, and appends the event.
 *
 * Every failure is recoverable by contract, and each returns `{ ok: false, ... }` having written nothing.
 *
 * @internal - Exported to allow testing.
 */
export async function runRelay(input: {
  argv: readonly string[];
  /** The hook's raw JSON payload, as read from stdin. */
  stdin: string;
  /** The relay's own working directory; the fallback when the payload names none. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  now: Date;
}): Promise<RelayResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return failure('invalid-args', error instanceof Error ? error.message : String(error));
  }

  const mapping = resolveHookMapping({ harness: args.harness, hook: args.hook });
  if (mapping === undefined) {
    return failure('unknown-hook', `${args.harness} hook "${args.hook}" maps to no event type; relaying nothing`);
  }

  const payload = parseHookPayload({ stdin: input.stdin, mapping });
  if (!payload.ok) {
    return failure('invalid-payload', payload.message);
  }

  // The payload's `cwd` is the session's directory; the relay's own is wherever the harness happened to spawn the hook,
  // so it stands in only when the payload names none. Attribution resolves against whichever wins.
  const cwd = payload.value.cwd ?? input.cwd;
  const [repo, branch] = await Promise.all([resolveRepo(cwd), resolveBranch(cwd)]);
  const session = payload.value.session ?? resolveSession(input.env);

  const envelope = composeEnvelope({
    id: ulid(),
    now: input.now,
    type: mapping.type,
    context: {
      ...(repo !== undefined && { repo }),
      ...(branch !== undefined && { branch }),
      ...(session !== undefined && { session }),
      cwd,
      harness: args.harness,
    },
    payload: payload.value.discriminators,
  });
  const filePath = resolveEventPath({
    home: args.home ?? homedir(),
    ...(repo !== undefined && { repo }),
    ...(branch !== undefined && { branch }),
    ...(session !== undefined && { session }),
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
 * Parses the relay's argv. Each flag accepts both `--flag value` and `--flag=value`. An unknown flag, an unexpected
 * positional, an empty value, a missing or unserved `--harness`, or a missing `--hook` throws; the caller turns that
 * into an `invalid-args` result.
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

  const harness = raw.harness;
  if (harness === undefined) {
    throw new Error('--harness is required');
  }
  if (!isRelayHarness(harness)) {
    throw new Error(`--harness must be one of ${listRelayHarnesses().join(', ')}, got: ${harness}`);
  }

  const hook = raw.hook;
  if (hook === undefined) {
    throw new Error('--hook is required');
  }

  return { harness, hook, home: raw.home ?? null };
}

/**
 * Reads the fields the relay needs out of the hook's raw stdin payload: the session, the working directory, and the
 * mapping's discriminator keys. The payload must be a JSON object; anything else fails the relay rather than being
 * coerced, because a hook that sent something else is not a hook this relay understands.
 *
 * Within a well-formed object every field is optional. The harnesses agree on `session_id` and `cwd` today, but a
 * harness that stops supplying one should cost that event its attribution — which the envelope already models as an
 * omitted key — rather than cost the session its event. A field present but not a string is treated as absent for the
 * same reason.
 *
 * @internal - Exported to allow testing.
 */
export function parseHookPayload(input: {
  stdin: string;
  mapping: HookMapping;
}): { ok: true; value: HookPayload } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.stdin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `the hook payload is not valid JSON: ${message}` };
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: `the hook payload must be a JSON object, got: ${input.stdin.trim()}` };
  }

  const discriminators: Record<string, unknown> = {};
  for (const key of input.mapping.discriminators) {
    if (parsed[key] !== undefined) {
      discriminators[key] = parsed[key];
    }
  }

  const session = readString(parsed, SESSION_KEY);
  const cwd = readString(parsed, CWD_KEY);
  return {
    ok: true,
    value: {
      ...(session !== undefined && { session }),
      ...(cwd !== undefined && { cwd }),
      discriminators,
    },
  };
}

// region | Helpers

/** Builds a failure result, warning on stderr so the failure is visible to an operator and not only on stdout. */
function failure(error: RelayErrorCode, message: string): RelayFailure {
  warn(message);
  return { ok: false, error, message };
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`, matching the degrade-with-warning pattern the emit-event helper uses.
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

/**
 * Reads the hook's payload from stdin to EOF.
 *
 * A terminal short-circuits to the empty string: with no harness on the other end there is no payload coming, and
 * reading would block until the operator typed EOF. Under a hook, stdin is a pipe the harness closes.
 */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return await text(process.stdin);
}

/** Reads `key` from a payload as a non-empty string, or `undefined` when it is absent, empty, or another type. */
function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The checked-out branch at `cwd`, or `undefined` when there is none to read: git cannot answer (no repository, no git
 * binary, a working directory that no longer exists) or HEAD is detached, which git reports as an empty branch name.
 * Both warn, because a relay that silently files every event under the no-branch placeholder is indistinguishable from
 * one that is working.
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

/** Writes one diagnostic line to stderr. Stdout carries the machine-readable result, so it stays clean. */
function warn(message: string): void {
  process.stderr.write(`relay-hook-event: warning: ${message}\n`);
}

// endregion | Helpers
