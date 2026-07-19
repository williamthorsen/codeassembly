// The pure lane fold: events in, state out. Accumulation (`applySessionEvent`, one small update per event) is
// separated from derivation (`deriveSessionStatus` / `deriveLaneStatus`, computed from accumulated state plus the
// clock and probe inputs), so an incremental caller folds cheaply per append and derives only when it renders.
//
// Nothing here touches the filesystem or samples the clock: time arrives as `nowMs`, and server-side facts (worktree
// existence) arrive as probe results. That is what keeps the fold browser-safe and testable without fakes.
//
// Working/waiting derives from the harness-relayed `turn.*` boundaries alone; `skill.*` events supply narration and
// never flip the phase. A session whose boundaries are missing therefore reads as `idle` while still narrating its
// skill — honest about what the log does not show.

import type { EventEnvelope } from './envelope.ts';
import { parseTicketRef, type TicketRef } from './ticket-ref.ts';

/** Where a session stands in its conversation loop, derived from the latest boundary event. */
export type SessionPhase = 'idle' | 'working' | 'waiting' | 'ended';

/**
 * Accumulated per-session state: what the fold knows after applying the session's events in order. Fields are
 * `undefined` rather than absent so reducer updates stay plain spreads.
 */
export interface SessionState {
  /** The latest boundary the session crossed; `idle` until a boundary event arrives. */
  phase: SessionPhase;
  /** The harness from the most recent event that carried one. */
  harness: string | undefined;
  /** The skill currently narrating work; cleared at every turn and session boundary. */
  currentSkill: string | undefined;
  /** The pending ask's payload, set by `input.requested` and cleared when the next turn starts. */
  ask: Record<string, unknown> | undefined;
  /** Timestamp of the last applied event. */
  lastEventTs: string | undefined;
}

/** Display state derived from a session: its phase plus narration, pending ask, and the staleness overlay. */
export interface SessionStatus {
  phase: SessionPhase;
  /** The skill the session is narrating, when one is running. */
  skill: string | undefined;
  /** The pending ask's payload — what a `waiting` session is waiting on. */
  ask: Record<string, unknown> | undefined;
  /** True when a `working` session has gone quiet past the threshold. Quiet is normal in every other phase. */
  stale: boolean;
  lastEventTs: string | undefined;
}

/** One lane: a repo × sanitized-branch event group, holding its sessions and derived ticket attribution. */
export interface LaneState {
  /** `owner/name` repo key. */
  repo: string;
  /** Sanitized branch name — the lane key within the repo. */
  branch: string;
  /** Ticket attribution parsed from the branch name; `undefined` for a non-conforming name. */
  ticketRef: TicketRef | undefined;
  /** Session state keyed by session id. */
  sessions: Record<string, SessionState>;
}

/** Server-side probe results fed into lane derivation. Every field is `undefined` when unprobed. */
export interface LaneProbes {
  /** False when the lane's worktree is known to be gone — the merge/cleanup closure signal. */
  worktreeExists?: boolean;
}

/** Why a closed lane closed. */
export type LaneClosureReason = 'worktree-gone' | 'all-sessions-ended' | 'stale';

/** Display state derived from a lane: whether it is still open, and its most recent activity. */
export interface LaneStatus {
  open: boolean;
  /** Present exactly when the lane is closed. */
  closedReason: LaneClosureReason | undefined;
  /** The newest event timestamp across the lane's sessions. */
  lastEventTs: string | undefined;
}

/** Folds one event into `lane`, creating the session's state on first sight. Pure: returns a new lane. */
export function applyLaneEvent(lane: LaneState, input: { sessionId: string; envelope: EventEnvelope }): LaneState {
  const current = lane.sessions[input.sessionId] ?? createSessionState();
  return {
    ...lane,
    sessions: { ...lane.sessions, [input.sessionId]: applySessionEvent(current, input.envelope) },
  };
}

/**
 * Folds one event into a session's state. Pure: returns a new state.
 *
 * Boundary semantics worth naming: every turn and session boundary clears the narration label, so a turn whose
 * `skill.completed` never arrived cannot leak a stale "running {skill}" into later turns; and a `session.started`
 * after `session.ended` reopens the session, which is how a resumed harness session comes back for free.
 */
export function applySessionEvent(state: SessionState, envelope: EventEnvelope): SessionState {
  const next: SessionState = {
    ...state,
    harness: envelope.harness ?? state.harness,
    lastEventTs: envelope.ts,
  };
  switch (envelope.type) {
    case 'session.started':
      return { ...next, phase: 'idle', currentSkill: undefined, ask: undefined };
    case 'turn.started':
      return { ...next, phase: 'working', currentSkill: undefined, ask: undefined };
    case 'turn.completed':
      return { ...next, phase: 'waiting', currentSkill: undefined };
    case 'session.ended':
      return { ...next, phase: 'ended', currentSkill: undefined, ask: undefined };
    case 'skill.started':
      return { ...next, currentSkill: readSkill(envelope) };
    case 'skill.progress':
      return { ...next, currentSkill: next.currentSkill ?? readSkill(envelope) };
    case 'skill.completed':
      return { ...next, currentSkill: undefined };
    case 'input.requested':
      return { ...next, ask: envelope.payload };
    default:
      // Undeclared and narration-free types (`artifact.written`, `pr.created`, anything newer than this fold) still
      // advance recency, so a future vocabulary addition is a non-breaking event to receive.
      return next;
  }
}

/** A lane with no events yet, its ticket attribution derived from the branch name. */
export function createLaneState(input: { repo: string; branch: string }): LaneState {
  return { repo: input.repo, branch: input.branch, ticketRef: parseTicketRef(input.branch), sessions: {} };
}

/** A session no events have been applied to. */
export function createSessionState(): SessionState {
  return { phase: 'idle', harness: undefined, currentSkill: undefined, ask: undefined, lastEventTs: undefined };
}

/**
 * Derives a lane's open/closed state. Closure signals in precedence order: a probe reporting the worktree gone, every
 * session ended, then lane-wide quiet past `closeAfterMs`. A lane with none of them — recent activity, or no events at
 * all — is open.
 */
export function deriveLaneStatus(
  lane: LaneState,
  input: { nowMs: number; closeAfterMs: number; probes?: LaneProbes },
): LaneStatus {
  const sessions = Object.values(lane.sessions);
  const lastEventTs = resolveLaneRecency(sessions);
  const lastMs = toEpochMs(lastEventTs);

  let closedReason: LaneClosureReason | undefined;
  if (input.probes?.worktreeExists === false) {
    closedReason = 'worktree-gone';
  } else if (sessions.length > 0 && sessions.every((session) => session.phase === 'ended')) {
    closedReason = 'all-sessions-ended';
  } else if (lastMs > 0 && input.nowMs - lastMs > input.closeAfterMs) {
    closedReason = 'stale';
  }

  return { open: closedReason === undefined, closedReason, lastEventTs };
}

/** Derives a session's display state, overlaying staleness on an actively working session that has gone quiet. */
export function deriveSessionStatus(state: SessionState, input: { nowMs: number; staleMs: number }): SessionStatus {
  const lastMs = toEpochMs(state.lastEventTs);
  const stale = state.phase === 'working' && lastMs > 0 && input.nowMs - lastMs > input.staleMs;
  return { phase: state.phase, skill: state.currentSkill, ask: state.ask, stale, lastEventTs: state.lastEventTs };
}

// region | Helpers

/** The `skill` narration label an event's payload carries, when it carries one. */
function readSkill(envelope: EventEnvelope): string | undefined {
  const { skill } = envelope.payload;
  return typeof skill === 'string' ? skill : undefined;
}

/** The newest last-event timestamp across `sessions`, or `undefined` when no session has one. */
function resolveLaneRecency(sessions: readonly SessionState[]): string | undefined {
  let newest: string | undefined;
  for (const session of sessions) {
    if (session.lastEventTs !== undefined && toEpochMs(session.lastEventTs) > toEpochMs(newest)) {
      newest = session.lastEventTs;
    }
  }
  return newest;
}

/** Parses an ISO timestamp to epoch milliseconds, returning 0 when absent or unparseable. */
function toEpochMs(ts: string | undefined): number {
  if (ts === undefined) {
    return 0;
  }
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

// endregion | Helpers
