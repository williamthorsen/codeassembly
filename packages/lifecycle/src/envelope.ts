/**
 * The v0 session-lifecycle vocabulary, ordered by the sequence in which a session emits the types, so the list doubles
 * as the shape of a session: session boundaries enclose turns, which enclose the skills a turn runs.
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

export type EventType = (typeof EVENT_TYPES)[number];

/** Membership index over the vocabulary, widened to `string` so an arbitrary type can be tested against it. */
const DECLARED_TYPES: ReadonlySet<string> = new Set(EVENT_TYPES);

/** True when `value` names a declared v0 event type. */
export function isEventType(value: string): value is EventType {
  return DECLARED_TYPES.has(value);
}

/**
 * One appended event.
 *
 * An optional field is absent when it cannot be resolved. The file path substitutes a placeholder for such a field so
 * that the event still lands somewhere; the absent key is what tells a consumer that the field was not resolved.
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
  /** Absolute working directory from which the emission ran. */
  cwd: string;
  /** The agent platform (`claude`, `rovo`), injected into the invocation template at install time. */
  harness?: string;
  /** The per-family event body; `{}` when the caller supplies none. */
  payload: Record<string, unknown>;
}
