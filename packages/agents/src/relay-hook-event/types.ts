import type { EventType } from 'codeassembly-lifecycle';

import type { HarnessId } from '../lib/types.ts';

/**
 * One relayed hook: the event type it becomes, and the payload keys carried through into the event body.
 *
 * Discriminators are copied verbatim, in each harness's own shape: Claude at the payload's top level, Rovo nested
 * under `attributes`. Only the harness knows what its keys mean, and no harness publishes a mapping between them.
 */
export interface HookMapping {
  /** The event type the hook relays as. */
  type: EventType;
  /** Payload keys copied verbatim into the event body when the hook supplies them. */
  discriminators: readonly string[];
}

/** The fields the relay reads out of a hook's stdin payload. */
export interface HookPayload {
  /** The harness's id for the session the hook fired in. */
  session?: string;
  /** The directory the session runs in; what repo and branch attribution resolve against. */
  cwd?: string;
  /** The mapping's discriminator keys that were present, copied verbatim. `{}` when the hook carries none. */
  discriminators: Record<string, unknown>;
}

/** Parsed command-line invocation of the relay. */
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
  error: RelayErrorCode;
  /** Short human-readable explanation, also written to stderr. */
  message: string;
}

/**
 * Categorical error codes the relay can return.
 *
 * `unknown-hook` is the one that is not a defect: a config can name a hook this relay's table does not know yet — the
 * config outlives any single version of the mapping — so an unrecognized name declines to emit rather than guessing.
 */
export type RelayErrorCode = 'invalid-args' | 'invalid-payload' | 'unknown-hook' | 'write-failed' | 'internal-error';

/** The relay's full stdout payload: a discriminated union on `ok`. */
export type RelayResult = RelaySuccess | RelayFailure;
