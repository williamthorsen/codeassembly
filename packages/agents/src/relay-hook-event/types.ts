// Shapes for the hook relay: what a relayed hook maps to, the fields the relay reads out of a hook payload, the parsed
// CLI input, and the JSON result it prints.
//
// The relay observes a session it must never disturb, so — like the emit-event helper whose internals it composes —
// every failure it can reach surfaces as a `{ ok: false, error, message }` payload on stdout with a stderr warning and
// a zero exit. Here the contract is stricter than courtesy: Claude Code reads some non-zero hook exits as control
// signals (a `Stop` hook exiting 2 blocks the agent from stopping), so a relay that exited non-zero on a bad payload
// would not merely lose an event, it would wedge the session.

import type { EventType } from '@codeassembly/lifecycle';

import type { HarnessId } from '../lib/types.ts';

/**
 * One relayed hook: the event type it becomes, and the payload keys carried through into the event body.
 *
 * Discriminators are copied verbatim rather than normalized across harnesses. Each harness describes a start or an end
 * in its own shape — Claude at the payload's top level, Rovo nested under `attributes` — and only the harness knows
 * what its keys mean. Preserving both shapes keeps the relay a courier; flattening them into a common vocabulary would
 * mean inventing a mapping neither harness publishes.
 */
export interface HookMapping {
  /** The event type the hook relays as. */
  type: EventType;
  /** Payload keys copied verbatim into the event body when the hook supplies them. */
  discriminators: readonly string[];
}

/** The fields the relay reads out of a hook's stdin payload. Each is absent when the harness did not supply it. */
export interface HookPayload {
  /** The harness's id for the session the hook fired in. */
  session?: string;
  /** The directory the session runs in; what repo and branch attribution resolve against. */
  cwd?: string;
  /** The mapping's discriminator keys that were present, copied verbatim. `{}` when the hook carries none. */
  discriminators: Record<string, unknown>;
}

/** Parsed command-line invocation of the relay. The hook's identity arrives here, never on stdin. */
export interface ParsedArgs {
  /** The harness whose hook fired, injected when the hook entry is configured. */
  harness: HarnessId;
  /** The harness's own name for the hook, injected alongside `harness`. */
  hook: string;
  /** Events-root override, so a test can point the write at a fixture instead of the real home directory. */
  home: string | null;
}

/** The relay's stdout payload on a successful append. */
export interface RelaySuccess {
  ok: true;
  /** The generated ULID, matching the appended envelope's `id`. */
  id: string;
  /** Absolute path of the JSONL file the envelope was appended to. */
  path: string;
}

/** The relay's stdout payload when no event was relayed. Nothing was written. */
export interface RelayFailure {
  ok: false;
  /** Categorical error code. */
  error: RelayErrorCode;
  /** Short human-readable explanation, also written to stderr. */
  message: string;
}

/**
 * Categorical error codes the relay can return. Each exits 0.
 *
 * `unknown-hook` is the one that is not a defect: a config can name a hook this relay's table does not know yet — the
 * config outlives any single version of the mapping — so an unrecognized name declines to emit rather than guessing.
 */
export type RelayErrorCode = 'invalid-args' | 'invalid-payload' | 'unknown-hook' | 'write-failed' | 'internal-error';

/** The relay's full stdout payload: a discriminated union on `ok`. */
export type RelayResult = RelaySuccess | RelayFailure;
