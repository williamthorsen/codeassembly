// Shapes for the emit-event helper: the lifecycle-event vocabulary, the envelope appended to the event log, the parsed
// CLI input, and the JSON result emitted to stdout.
//
// The helper must never block the skill it observes, so every failure it can reach — bad arguments, an unusable
// payload, a failed write — surfaces as a `{ ok: false, error, message }` payload on stdout with a stderr warning and a
// zero exit. There is no out-of-band failure channel; the result union is total.

/**
 * The v0 session-lifecycle vocabulary, ordered by the sequence a session emits rather than alphabetically, so the list
 * doubles as the shape of a session: session boundaries enclose turns, which enclose the skills a turn runs.
 * Membership is convention, not a gate: an undeclared type warns and is still appended, which lets an emitter use a new
 * type before the vocabulary catches up.
 *
 * Two channels feed the vocabulary. The `session.*` and `turn.*` boundaries come from the harness, relayed from its
 * event hooks — a session ends and a turn completes at moments no skill is running to observe. The rest is work
 * narration an instrumented skill emits about itself.
 */
export const EVENT_TYPES = [
  'session.started',
  'turn.started',
  'skill.started',
  'skill.progress',
  'skill.completed',
  'artifact.written',
  'input.requested',
  'pr.created',
  'turn.completed',
  'session.ended',
] as const;

/** One of the declared v0 event types. */
export type EventType = (typeof EVENT_TYPES)[number];

/** Membership index over the vocabulary, widened to `string` so an arbitrary type can be tested against it. */
const DECLARED_TYPES: ReadonlySet<string> = new Set(EVENT_TYPES);

/** True when `value` names a declared v0 event type. */
export function isEventType(value: string): value is EventType {
  return DECLARED_TYPES.has(value);
}

/**
 * One appended event. `type` is a bare `string` rather than an `EventType` because an undeclared type is emitted rather
 * than refused; a consumer reading the log must therefore be prepared for a type outside {@link EVENT_TYPES}.
 *
 * `repo`, `branch`, `session`, and `harness` are absent when unresolvable. They are deliberately omitted rather than
 * set to the placeholder that stands in for them in the file path: the placeholder exists so an event still lands
 * somewhere, while an absent key is what tells a consumer the field could not be resolved.
 */
export interface EventEnvelope {
  /** ULID, unique per event and monotonic within a millisecond. */
  id: string;
  /** Millisecond-precision ISO-8601 emission timestamp. */
  ts: string;
  /** The event type; one of `EVENT_TYPES` by convention, but not enforced. */
  type: string;
  /** `owner/name` of the git remote at `cwd`; omitted when unresolvable. */
  repo?: string;
  /** The checked-out branch; omitted when unresolvable or HEAD is detached. */
  branch?: string;
  /** The emitting session; omitted when neither `--session` nor the harness's session variable supplies one. */
  session?: string;
  /** Absolute working directory the emission ran from. */
  cwd: string;
  /** The agent platform (`claude`, `rovodev`), injected into the invocation template at install time. */
  harness?: string;
  /** The per-family event body; `{}` when the caller supplies none. */
  payload: Record<string, unknown>;
}

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
  /** Categorical error code. */
  error: EmitErrorCode;
  /** Short human-readable explanation, also written to stderr. */
  message: string;
}

/** Categorical error codes the helper can return. Each exits 0: telemetry never blocks the skill it observes. */
export type EmitErrorCode = 'invalid-args' | 'invalid-payload' | 'write-failed' | 'internal-error';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type EmitResult = EmitSuccess | EmitFailure;
