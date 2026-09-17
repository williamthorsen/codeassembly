/**
 * CLI entry for the harness hook relay.
 *
 * A harness's event hooks fire at boundaries that no skill is running to observe, so the hook reports them in the
 * agent's place. Configured as a hook command, this relay reads the hook's JSON payload on stdin and appends the
 * lifecycle event that `{harness, hook}` maps to.
 *
 * The hook's identity comes from the flags: Because the two harnesses' payload shapes differ, stdin supplies only
 * data, and the flags, which are fixed when the hook entry is configured, supply the mapping key.
 *
 * Every exit is 0, failures included, because Claude Code reads some non-zero hook exits as control signals rather
 * than as failures: A `Stop` hook exiting 2 blocks the agent from stopping. A relay that exited non-zero on a bad
 * payload would block the session rather than merely lose an event.
 *
 * `--sentinel` is accepted and ignored here: It marks the configured hook entries for the config tools that wrote them.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
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

const FLAGS: readonly FlagSpec[] = [
  { name: 'harness', takesValue: true },
  { name: 'hook', takesValue: true },
  { name: 'home', takesValue: true },
  { name: 'sentinel', takesValue: true },
];

/** The payload key under which each harness reports the session's id. */
const SESSION_KEY = 'session_id';

/** The payload key under which each harness reports the session's working directory. */
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
    // `runRelay` converts every failure that it anticipates into a structured result, so reaching here means
    // something unforeseen threw.
    result = failure('internal-error', describeError(error));
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs the relay end to end, from the hook's argv and stdin to the appended event.
 *
 * Every failure is recoverable by contract, and for each, `runRelay` returns `{ ok: false, ... }` having written
 * nothing.
 *
 * @internal - Exported to allow testing.
 */
export async function runRelay(input: {
  argv: readonly string[];
  /** The hook's raw JSON payload, as read from stdin. */
  stdin: string;
  /** The relay's own working directory. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  now: Date;
}): Promise<RelayResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return failure('invalid-args', describeError(error));
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
  // so it is used only when the payload names none. The relay resolves attribution against whichever of the two it
  // uses.
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
    const message = describeError(error);
    return failure('write-failed', `could not append the event to ${filePath}: ${message}`);
  }

  return { ok: true, id: envelope.id, path: filePath };
}

/**
 * Parses the relay's argv, throwing on any defect in it. The caller turns the throw into an `invalid-args` result.
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
 * Reads the fields that the relay needs out of the hook's raw stdin payload: the session, the working directory, and
 * the mapping's discriminator keys. The payload must be a JSON object, because a hook that sent anything else is not a
 * hook that this relay understands.
 *
 * Within a well-formed object every field is optional, and a field present but not a string counts as absent. The
 * harnesses agree on `session_id` and `cwd` today, but when a harness stops supplying one, that event loses its
 * attribution, which the envelope already models as an omitted key, and the session never loses its event.
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
    const message = describeError(error);
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

/** Builds a failure result and warns on stderr, so that an operator watching the session sees the failure. */
function failure(error: RelayErrorCode, message: string): RelayFailure {
  warn(message);
  return { ok: false, error, message };
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
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
    warn(`could not determine entry point: ${describeError(error)}`);
    return false;
  }
}

/**
 * Reads the hook's payload from stdin to EOF.
 *
 * When stdin is a terminal, `readStdin` returns the empty string without reading: With no harness on the other end
 * there is no payload coming, and reading would block until the operator typed EOF. Under a hook, stdin is a pipe that
 * the harness closes.
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
 * In both cases `resolveBranch` warns, because a relay that silently files every event under the no-branch placeholder
 * is indistinguishable from one that is working.
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

/** Writes one diagnostic line to stderr. Stdout contains the machine-readable result, so it stays clean. */
function warn(message: string): void {
  process.stderr.write(`relay-hook-event: warning: ${message}\n`);
}

// endregion | Helpers
