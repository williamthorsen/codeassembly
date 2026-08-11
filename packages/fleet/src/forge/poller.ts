// The forge poller: an interval loop that reads resident lanes, batches each repo's branches and forge ticket ids into
// one adapter call, and folds the results into a per-lane cache the snapshot layer overlays. The cache is a rebuildable
// server concern, never a writer's — a restart simply re-polls.
//
// Staleness is attempt-based, not age-based: a lane reads stale exactly when the most recent poll of its repo failed,
// and its last-known facts keep being served until a poll succeeds. Rounds never overlap — a tick fired while one is in
// flight is skipped rather than queued — and with no adapter (`FLEET_FORGE=none`) the loop is inert.

import { describeError } from '@williamthorsen/toolbelt.errors/candidate';
import type { LaneState } from 'codeassembly-lifecycle';

import { buildLaneKey } from '../common/lane-key.ts';
import { getOrCreate, retainKeys } from '../common/maps.ts';
import type { ForgeAdapter, PrFacts, TicketFacts } from './adapter.ts';

/** One lane's folded forge facts. `pr`/`ticket` are `undefined` until fetched; `stale` marks last-known-after-failure. */
export interface ForgeLaneFacts {
  pr: PrFacts | undefined;
  ticket: TicketFacts | undefined;
  /** ISO-8601 time of the successful fetch these facts came from, or of the failed attempt when never fetched. */
  fetchedAt: string;
  stale: boolean;
}

/** A running forge poller: the cache accessor the snapshot layer reads, a manual tick, and a stop. */
export interface ForgePoller {
  /** The lane's folded forge facts, or `undefined` before its repo's first completed poll. */
  getFacts(repo: string, branch: string): ForgeLaneFacts | undefined;
  /** Runs one poll round now; resolves immediately when disabled or when a previous round is still in flight. */
  tick(): Promise<void>;
  /** Halts the interval; an in-flight round is left to settle. */
  stop(): void;
}

/**
 * Starts the forge poller. With `adapter` undefined the loop is inert — `tick` is a no-op and `getFacts` stays empty —
 * so a disabled forge costs nothing. `onUpdate` fires after every completed round; the caller's diff gate suppresses
 * no-op broadcasts. `now` and `intervalMs` are injected so tests drive time.
 */
export function startForgePoller(input: {
  adapter: ForgeAdapter | undefined;
  intervalMs: number;
  listLanes: () => readonly LaneState[];
  log: (message: string) => void;
  now: () => number;
  onUpdate: () => void;
}): ForgePoller {
  const { adapter } = input;
  const cache = new Map<string, ForgeLaneFacts>();
  let inFlight = false;

  async function tick(): Promise<void> {
    if (adapter === undefined || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const lanes = input.listLanes();
      retainKeys(cache, new Set(lanes.map(buildLaneKey)));
      for (const group of groupLanesByRepo(lanes).values()) {
        await pollRepo(adapter, cache, group, input.now, input.log);
      }
      input.onUpdate();
    } finally {
      inFlight = false;
    }
  }

  const interval = adapter === undefined ? undefined : setInterval(() => void tick(), input.intervalMs);

  return {
    getFacts: (repo, branch) => cache.get(buildLaneKey({ repo, branch })),
    tick,
    stop: () => {
      if (interval !== undefined) {
        clearInterval(interval);
      }
    },
  };
}

// region | Helpers

/** A repo's lanes gathered for one batched adapter call, with its forge ticket ids deduplicated. */
interface RepoGroup {
  repo: string;
  lanes: LaneState[];
  ticketIds: Set<string>;
}

/** The lane's forge ticket id — its bare-numeric ticket ref — or `undefined` for a Jira-style or absent ref. */
function forgeTicketId(lane: LaneState): string | undefined {
  const id = lane.ticketRef?.ticketId;
  return id !== undefined && /^[0-9]+$/.test(id) ? id : undefined;
}

/** Groups lanes by repo, collecting each repo's lanes and the deduplicated forge ticket ids to resolve. */
function groupLanesByRepo(lanes: readonly LaneState[]): Map<string, RepoGroup> {
  const groups = new Map<string, RepoGroup>();
  for (const lane of lanes) {
    const group = getOrCreate(groups, lane.repo, () => ({ repo: lane.repo, lanes: [], ticketIds: new Set<string>() }));
    group.lanes.push(lane);
    const ticketId = forgeTicketId(lane);
    if (ticketId !== undefined) {
      group.ticketIds.add(ticketId);
    }
  }
  return groups;
}

/**
 * Polls one repo and folds its facts into the cache. Success writes fresh facts with `stale: false`; a repo-level
 * failure retains each lane's last-known facts and flips `stale: true`, logging one notice.
 */
async function pollRepo(
  adapter: ForgeAdapter,
  cache: Map<string, ForgeLaneFacts>,
  group: RepoGroup,
  now: () => number,
  log: (message: string) => void,
): Promise<void> {
  const fetchedAt = new Date(now()).toISOString();
  try {
    const state = await adapter.fetchRepoState({
      repo: group.repo,
      branches: group.lanes.map((lane) => lane.branch),
      ticketIds: [...group.ticketIds],
    });
    for (const lane of group.lanes) {
      const ticketId = forgeTicketId(lane);
      cache.set(buildLaneKey(lane), {
        pr: state.branchPrs[lane.branch],
        ticket: ticketId === undefined ? undefined : state.tickets[ticketId],
        fetchedAt,
        stale: false,
      });
    }
  } catch (error) {
    for (const lane of group.lanes) {
      const key = buildLaneKey(lane);
      const existing = cache.get(key);
      cache.set(
        key,
        existing === undefined
          ? { pr: undefined, ticket: undefined, fetchedAt, stale: true }
          : { ...existing, stale: true },
      );
    }
    log(`forge poll failed for ${group.repo} (${describeError(error)}); serving last-known facts as stale`);
  }
}

// endregion | Helpers
