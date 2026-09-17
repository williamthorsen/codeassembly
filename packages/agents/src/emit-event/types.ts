// Writer-side shapes for the emit-event helper.

/** The auto-filled context an envelope carries beyond the agent-supplied `type` and `payload`. */
export interface EmitContext {
  /** `owner/name` git remote at `cwd`, best-effort. */
  repo?: string;
  /** The checked-out branch at `cwd`, best-effort. */
  branch?: string;
  /** `--session`, else the harness's session environment variable. */
  session?: string;
  /** Absolute working directory the emission ran from. */
  cwd: string;
  /** The install-injected agent platform. */
  harness?: string;
}

/** Parsed command-line invocation of the emit-event helper. */
export interface ParsedArgs {
  /** The event type. The one required flag. */
  type: string;
  /** The raw `--payload` JSON text, left unparsed here; `null` when omitted. */
  payload: string | null;
  /** Session id overriding the environment-derived one, for a harness that relays a session id out of band. */
  session: string | null;
  /** The agent platform, injected from the installed invocation template. */
  harness: string | null;
  /** Events-root override, so a test can point the write at a fixture instead of the real home directory. */
  home: string | null;
}

/** The helper's stdout payload on a successful append. */
export interface EmitSuccess {
  ok: true;
  /** The generated ULID, matching the appended envelope's `id`. */
  id: string;
  /** Absolute path of the JSONL file the envelope was appended to. */
  path: string;
}

/** The helper's stdout payload when the event could not be emitted. Nothing was written. */
export interface EmitFailure {
  ok: false;
  error: EmitErrorCode;
  /** Short human-readable explanation, also written to stderr. */
  message: string;
}

/** Categorical error codes the helper can return. */
export type EmitErrorCode = 'invalid-args' | 'invalid-payload' | 'write-failed' | 'internal-error';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type EmitResult = EmitSuccess | EmitFailure;
