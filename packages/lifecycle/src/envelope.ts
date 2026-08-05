// The canonical lifecycle-event vocabulary and envelope.

/**
 * The v0 session-lifecycle vocabulary, ordered by the sequence a session emits rather than alphabetically, so the list
 * doubles as the shape of a session: session boundaries enclose turns, which enclose the skills a turn runs.
 * Membership is convention, not a gate: an undeclared type is still a valid event, so an emitter can use a new type
 * before the vocabulary catches up.
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
  /** The agent platform (`claude`, `rovo`), injected into the invocation template at install time. */
  harness?: string;
  /** The per-family event body; `{}` when the caller supplies none. */
  payload: Record<string, unknown>;
}
