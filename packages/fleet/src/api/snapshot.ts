// The wire shapes the API serves and the pure derivation from folded lane state into them. Absent values are `null`
// rather than optional `undefined`: JSON drops `undefined`-valued keys, so with `exactOptionalPropertyTypes` a
// round-tripped type only matches what the client receives when absence is spelled `null`.

import {
  deriveLaneStatus,
  deriveSessionStatus,
  type LaneClosureReason,
  type LaneState,
  type SessionPhase,
  type SessionState,
} from '@codeassembly/lifecycle';

/** The full-fleet frame served by the lanes route and pushed over SSE. */
export interface FleetSnapshot {
  lanes: LaneSnapshot[];
}

/** One lane's wire state, its sessions sorted most-recent-first. */
export interface LaneSnapshot {
  repo: string;
  branch: string;
  ticketRef: TicketRefSnapshot | null;
  open: boolean;
  closedReason: LaneClosureReason | null;
  lastEventTs: string | null;
  sessions: SessionSnapshot[];
}

/** One session's wire state. */
export interface SessionSnapshot {
  session: string;
  harness: string | null;
  phase: SessionPhase;
  skill: string | null;
  ask: Record<string, unknown> | null;
  stale: boolean;
  lastEventTs: string | null;
}

/** Ticket attribution on the wire. */
export interface TicketRefSnapshot {
  ticketId: string;
  revisit: number | null;
}

/**
 * Derives the wire snapshot for `lanes` at the moment `nowMs`, sorting lanes and their sessions most-recent-first.
 * Lane probes stay unprobed here; server-side facts like worktree existence arrive with the git adapter.
 */
export function buildSnapshot(
  lanes: readonly LaneState[],
  input: { closeAfterMs: number; nowMs: number; staleMs: number },
): FleetSnapshot {
  const laneSnapshots = lanes.map((lane) => buildLaneSnapshot(lane, input));
  laneSnapshots.sort((a, b) => toEpochMs(b.lastEventTs) - toEpochMs(a.lastEventTs));
  return { lanes: laneSnapshots };
}

// region | Helpers

/** Derives one lane's wire state, its sessions sorted most-recent-first. */
function buildLaneSnapshot(
  lane: LaneState,
  input: { closeAfterMs: number; nowMs: number; staleMs: number },
): LaneSnapshot {
  const status = deriveLaneStatus(lane, { closeAfterMs: input.closeAfterMs, nowMs: input.nowMs, probes: {} });
  const sessions = Object.entries(lane.sessions).map(([sessionId, state]) =>
    buildSessionSnapshot(sessionId, state, input),
  );
  sessions.sort((a, b) => toEpochMs(b.lastEventTs) - toEpochMs(a.lastEventTs));
  return {
    repo: lane.repo,
    branch: lane.branch,
    ticketRef:
      lane.ticketRef === undefined
        ? null
        : { ticketId: lane.ticketRef.ticketId, revisit: lane.ticketRef.revisit ?? null },
    open: status.open,
    closedReason: status.closedReason ?? null,
    lastEventTs: status.lastEventTs ?? null,
    sessions,
  };
}

/** Derives one session's wire state, staleness overlaid. */
function buildSessionSnapshot(
  sessionId: string,
  state: SessionState,
  input: { nowMs: number; staleMs: number },
): SessionSnapshot {
  const status = deriveSessionStatus(state, { nowMs: input.nowMs, staleMs: input.staleMs });
  return {
    session: sessionId,
    harness: state.harness ?? null,
    phase: status.phase,
    skill: status.skill ?? null,
    ask: status.ask ?? null,
    stale: status.stale,
    lastEventTs: status.lastEventTs ?? null,
  };
}

/** Parses an ISO timestamp to epoch milliseconds, returning 0 when absent or unparseable. */
function toEpochMs(ts: string | null): number {
  if (ts === null) {
    return 0;
  }
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

// endregion | Helpers
