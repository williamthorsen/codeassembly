// Shapes for the capture-event helper: parsed CLI input, the prepared event record, and the JSON result emitted to
// stdout.
//
// The helper's stdout payload is a discriminated union on `ok`. Recoverable failures (no resolvable store, schema
// validation, invalid args) return `{ ok: false, error, ... }`; a success returns `{ ok: true, ... }`. System errors
// (out-of-disk, permission denied) are out of band: they print to stderr and exit non-zero.

import type { Finding } from '@codeassembly/kb-core';

/** Parsed command-line invocation of the capture-event helper. */
export interface ParsedArgs {
  /** Registry name of the event store to write into; defaults to `codeassembly`. */
  store: string;
  /** The event's `type` field (e.g. `observation`, `mistake`). */
  type: string;
  /** The human-readable one-line summary; becomes the record's display label on recall. */
  summary: string;
  /** Optional skill the event relates to. */
  skill: string | null;
  /** Optional model identifier. */
  model: string | null;
  /** Optional tag list, in the order the agent supplied them. */
  tags: string[];
  /** Verbatim correction text; required for `--type mistake`. */
  correction: string | null;
}

/** The auto-filled context an event carries beyond the agent-supplied fields. */
export interface CaptureContext {
  /** Session identifier read from `CLAUDE_CODE_SESSION_ID`. */
  session: string;
  /** Absolute working directory the capture ran from. */
  cwd: string;
  /** `owner/name` git remote at `cwd`, best-effort; omitted when unresolvable. */
  repo?: string;
}

/** The helper's stdout payload on success. */
export interface CaptureSuccess {
  ok: true;
  /** The generated ULID, which is also the record's filename stem. */
  id: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** Absolute path of the written record. */
  path: string;
  /** Registry name of the store the record was written to. */
  store: string;
}

/** The helper's stdout payload on a recoverable failure. */
export interface CaptureFailure {
  ok: false;
  /** Categorical error code. */
  error: CaptureErrorCode;
  /** Short human-readable explanation. */
  message: string;
  /** Schema-validation findings, set when `error: 'schema-validation'`. */
  findings?: Finding[];
}

/** Categorical error codes the helper can return without an unexpected throw. */
export type CaptureErrorCode = 'invalid-args' | 'store-not-registered' | 'readonly-store' | 'schema-validation';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type CaptureResult = CaptureSuccess | CaptureFailure;
