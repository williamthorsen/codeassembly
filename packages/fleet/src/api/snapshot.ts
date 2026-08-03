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
} from 'codeassembly-lifecycle';

import type { GitObservation } from '../adapters/git.ts';
import { buildLaneKey } from '../common/lane-key.ts';
import type { CheckState, PrFacts, PrState, ReviewState, TicketFacts } from '../forge/adapter.ts';
import type { ForgeLaneFacts } from '../forge/poller.ts';

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
  /** Git ground truth from the adapter's latest poll; `null` until the lane has been probed. */
  git: LaneGitSnapshot | null;
  sessions: SessionSnapshot[];
  /** Server-side forge enrichment; `null` before the lane's first fetch or when polling is disabled. */
  forge: ForgeLaneSnapshot | null;
}

/**
 * A lane's worktree state on the wire. Deliberately carries no probe timestamp: a per-poll field would change the
 * snapshot JSON every pass and defeat the publish diff gate — the poll interval itself bounds staleness.
 */
export interface LaneGitSnapshot {
  /** The checked-out branch; `null` when detached or unreadable. */
  branch: string | null;
  /** Count of working-tree changes. */
  dirtyFiles: number | null;
  /** Commits on the lane branch that the base branch lacks. */
  ahead: number | null;
  /** Commits on the base branch that the lane branch lacks; > 0 is base-branch advance. */
  behind: number | null;
  /** The remote-tracking base ref compared against, e.g. `origin/main`. */
  baseBranch: string | null;
}

/** Forge enrichment on the wire for one lane. */
export interface ForgeLaneSnapshot {
  pr: PrSnapshot | null;
  ticket: TicketSnapshot | null;
  fetchedAt: string;
  stale: boolean;
}

/** Pull-request facts on the wire. */
export interface PrSnapshot {
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  checks: CheckState | null;
  review: ReviewState | null;
}

/** Ticket facts on the wire — the minimal forge-portable core. */
export interface TicketSnapshot {
  title: string;
  state: string;
  url: string;
  createdAt: string;
  labels: string[];
}

/** Looks a lane's forge facts up by repo and branch; `undefined` when the lane has no fetched facts. */
export type ForgeFactsLookup = (repo: string, branch: string) => ForgeLaneFacts | undefined;

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
 * `observations` carries the git adapter's per-lane facts (keyed `{repo}/{branch}`) and `input.forge` overlays the
 * forge adapter's; a lane absent from either derives with unprobed lane probes and a `null` git or `forge` block.
 */
export function buildSnapshot(
  lanes: readonly LaneState[],
  input: {
    closeAfterMs: number;
    forge?: ForgeFactsLookup;
    nowMs: number;
    observations?: ReadonlyMap<string, GitObservation>;
    staleMs: number;
  },
): FleetSnapshot {
  const laneSnapshots = lanes.map((lane) =>
    buildLaneSnapshot(lane, input, input.observations?.get(buildLaneKey(lane))),
  );
  laneSnapshots.sort((a, b) => toEpochMs(b.lastEventTs) - toEpochMs(a.lastEventTs));
  return { lanes: laneSnapshots };
}

// region | Helpers

/** Derives the wire forge enrichment from a lane's cached facts, spelling absent pull request or ticket as `null`. */
function buildForgeSnapshot(facts: ForgeLaneFacts): ForgeLaneSnapshot {
  return {
    pr: facts.pr === undefined ? null : buildPrSnapshot(facts.pr),
    ticket: facts.ticket === undefined ? null : buildTicketSnapshot(facts.ticket),
    fetchedAt: facts.fetchedAt,
    stale: facts.stale,
  };
}

/** Derives one lane's wire state, its sessions sorted most-recent-first, with git and forge facts overlaid. */
function buildLaneSnapshot(
  lane: LaneState,
  input: { closeAfterMs: number; forge?: ForgeFactsLookup; nowMs: number; staleMs: number },
  observation: GitObservation | undefined,
): LaneSnapshot {
  const status = deriveLaneStatus(lane, {
    closeAfterMs: input.closeAfterMs,
    nowMs: input.nowMs,
    probes: observation === undefined ? {} : { worktreeExists: observation.worktreeExists },
  });
  const sessions = Object.entries(lane.sessions).map(([sessionId, state]) =>
    buildSessionSnapshot(sessionId, state, input),
  );
  sessions.sort((a, b) => toEpochMs(b.lastEventTs) - toEpochMs(a.lastEventTs));
  const forgeFacts = input.forge?.(lane.repo, lane.branch);
  return {
    repo: lane.repo,
    branch: lane.branch,
    ticketRef: deriveTicketRef(lane, forgeFacts),
    open: status.open,
    closedReason: status.closedReason ?? null,
    lastEventTs: status.lastEventTs ?? null,
    git:
      observation === undefined
        ? null
        : {
            branch: observation.branch,
            dirtyFiles: observation.dirtyFiles,
            ahead: observation.ahead,
            behind: observation.behind,
            baseBranch: observation.baseBranch,
          },
    sessions,
    forge: forgeFacts === undefined ? null : buildForgeSnapshot(forgeFacts),
  };
}

/** Derives the wire pull-request shape, spelling an absent check verdict or review decision as `null`. */
function buildPrSnapshot(pr: PrFacts): PrSnapshot {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    checks: pr.checks ?? null,
    review: pr.review ?? null,
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

/** Derives the wire ticket shape from cached ticket facts. */
function buildTicketSnapshot(ticket: TicketFacts): TicketSnapshot {
  return {
    title: ticket.title,
    state: ticket.state,
    url: ticket.url,
    createdAt: ticket.createdAt,
    labels: ticket.labels,
  };
}

/**
 * Derives a lane's ticket attribution. A branch-name-parsed ref wins; only when none was parsed and the lane's branch
 * carries a pull request does the D3 overlay mint the synthetic `PR-<number>` ref. Absent both, the ref is `null`.
 */
function deriveTicketRef(lane: LaneState, forgeFacts: ForgeLaneFacts | undefined): TicketRefSnapshot | null {
  if (lane.ticketRef !== undefined) {
    return { ticketId: lane.ticketRef.ticketId, revisit: lane.ticketRef.revisit ?? null };
  }
  if (forgeFacts?.pr !== undefined) {
    return { ticketId: `PR-${forgeFacts.pr.number}`, revisit: null };
  }
  return null;
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
