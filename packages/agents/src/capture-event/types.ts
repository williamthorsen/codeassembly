import type { EventImpact } from '@williamthorsen/kb/records';

/** Parsed command-line invocation of the capture-event helper. */
export interface ParsedArgs {
  /**
   * Registry name of the event store to write into, or the `@default` sentinel for the registry's `default_kb`;
   * `null` when `--store` is omitted, which the resolver refuses.
   */
  store: string | null;
  /** The human-readable one-line summary; becomes the record's display label on recall. */
  summary: string;
  /** Optional skill the event relates to. */
  skill: string | null;
  model: string | null;
  /** Optional harness (agent runtime) identifier, injected from the installed invocation template. */
  harness: string | null;
  /** Optional tag list, in the order the agent supplied them. */
  tags: string[];
  impact: EventImpact | null;
  /** The id of an existing event to amend instead of capturing a new one; `null` for a fresh capture. */
  amend: string | null;
}

/** The auto-filled context an event carries beyond the agent-supplied fields. */
export interface CaptureContext {
  /** Session identifier read from `CLAUDE_CODE_SESSION_ID`; omitted when the harness exposes none. */
  session?: string;
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
  /** Registry name of the store to which the record was written. */
  store: string;
}

/** The helper's stdout payload on a recoverable failure. */
export interface CaptureFailure {
  ok: false;
  error: CaptureErrorCode;
  /** Short human-readable explanation. */
  message: string;
  /** Validation errors, set when `error: 'schema-validation'`. */
  errors?: string[];
}

/** Categorical error codes the helper can return without an unexpected throw. */
export type CaptureErrorCode =
  | 'invalid-args'
  | 'missing-store'
  | 'store-not-registered'
  | 'readonly-store'
  | 'no-default-store'
  | 'schema-validation'
  | 'amend-not-found'
  | 'amend-parse';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type CaptureResult = CaptureSuccess | CaptureFailure;
