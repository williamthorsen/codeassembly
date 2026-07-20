import { applyLaneEvent, createLaneState, type EventEnvelope, type LaneState } from '@codeassembly/lifecycle';
import { assert, describe, expect, it } from 'vitest';

import type { GitObservation } from '../../adapters/git.ts';
import type { PrFacts } from '../../forge/adapter.ts';
import type { ForgeLaneFacts } from '../../forge/poller.ts';
import { buildSnapshot, type ForgeFactsLookup } from '../snapshot.ts';

const BASE_TS = '2026-07-19T05:00:00.000Z';
const BASE_MS = Date.parse(BASE_TS);
const DERIVE_INPUT = { closeAfterMs: 600_000, nowMs: BASE_MS + 1000, staleMs: 90_000 };

/** A minimal envelope of the given type. */
function composeEvent(type: string, overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', ts: BASE_TS, type, cwd: '/work/repo', payload: {}, ...overrides };
}

/** Folds `events` per session into a fresh lane. */
function composeLane(branch: string, sessions: Record<string, EventEnvelope[]>): LaneState {
  let lane = createLaneState({ repo: 'acme/app', branch });
  for (const [sessionId, events] of Object.entries(sessions)) {
    for (const envelope of events) {
      lane = applyLaneEvent(lane, { sessionId, envelope });
    }
  }
  return lane;
}

/** A forge-facts accessor over a map keyed by `repo/branch`. */
function composeForge(byLane: Record<string, ForgeLaneFacts>): ForgeFactsLookup {
  return (repo, branch) => byLane[`${repo}/${branch}`];
}

/** Pull-request facts with a sensible default, overridable per field. */
function composePrFacts(overrides: Partial<PrFacts> = {}): PrFacts {
  return {
    number: 42,
    title: 'Wire it',
    url: 'https://x/pull/42',
    state: 'open',
    isDraft: false,
    checks: undefined,
    review: undefined,
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('derives phase, narration, harness, and ticket attribution onto the wire shape', () => {
    const lane = composeLane('1036.2', {
      'sess-a': [
        composeEvent('turn.started', { harness: 'claude' }),
        composeEvent('skill.started', { payload: { skill: 'implement-plan' } }),
      ],
    });

    const snapshot = buildSnapshot([lane], DERIVE_INPUT);

    const [laneSnapshot] = snapshot.lanes;
    assert(laneSnapshot !== undefined, 'The lane should be present');
    expect(laneSnapshot.ticketRef).toEqual({ ticketId: '1036', revisit: 2 });
    expect(laneSnapshot.open).toBe(true);
    expect(laneSnapshot.closedReason).toBeNull();
    expect(laneSnapshot.sessions).toEqual([
      {
        session: 'sess-a',
        harness: 'claude',
        phase: 'working',
        skill: 'implement-plan',
        ask: null,
        stale: false,
        lastEventTs: BASE_TS,
      },
    ]);
  });

  it('spells absent values as null so the snapshot survives a JSON round-trip unchanged', () => {
    const lane = composeLane('no-ticket-here', { 'sess-a': [composeEvent('turn.started')] });

    const snapshot = buildSnapshot([lane], DERIVE_INPUT);

    expect(snapshot.lanes[0]?.ticketRef).toBeNull();
    // eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round-trip is the behavior under test
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('sorts lanes and sessions most-recent-first', () => {
    const laterTs = '2026-07-19T05:10:00.000Z';
    const quietLane = composeLane('101', { old: [composeEvent('turn.started')] });
    const busyLane = composeLane('102', {
      older: [composeEvent('turn.started')],
      newer: [composeEvent('turn.started', { ts: laterTs })],
    });

    const snapshot = buildSnapshot([quietLane, busyLane], { ...DERIVE_INPUT, nowMs: Date.parse(laterTs) + 1000 });

    expect(snapshot.lanes.map((lane) => lane.branch)).toEqual(['102', '101']);
    expect(snapshot.lanes[0]?.sessions.map((session) => session.session)).toEqual(['newer', 'older']);
  });

  it('overlays staleness on a working session that has gone quiet past the threshold', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, nowMs: BASE_MS + 90_001 });

    expect(snapshot.lanes[0]?.sessions[0]?.stale).toBe(true);
  });

  it("overlays a lane's git observation onto the wire shape", () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });
    const observation: GitObservation = {
      worktreeExists: true,
      branch: '101',
      dirtyFiles: 2,
      ahead: 3,
      behind: 1,
      baseBranch: 'origin/main',
    };

    const snapshot = buildSnapshot([lane], {
      ...DERIVE_INPUT,
      observations: new Map([['acme/app/101', observation]]),
    });

    expect(snapshot.lanes[0]?.open).toBe(true);
    expect(snapshot.lanes[0]?.git).toEqual({
      branch: '101',
      dirtyFiles: 2,
      ahead: 3,
      behind: 1,
      baseBranch: 'origin/main',
    });
  });

  it('leaves the git block null for a lane the observations do not cover', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, observations: new Map() });

    expect(snapshot.lanes[0]?.git).toBeNull();
    expect(snapshot.lanes[0]?.open).toBe(true);
  });

  it('closes a lane whose observation reports the worktree gone', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });
    const observation: GitObservation = {
      worktreeExists: false,
      branch: null,
      dirtyFiles: null,
      ahead: null,
      behind: null,
      baseBranch: null,
    };

    const snapshot = buildSnapshot([lane], {
      ...DERIVE_INPUT,
      observations: new Map([['acme/app/101', observation]]),
    });

    expect(snapshot.lanes[0]?.open).toBe(false);
    expect(snapshot.lanes[0]?.closedReason).toBe('worktree-gone');
  });

  it('closes a lane whose sessions have all gone quiet past the closure threshold', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.completed')] });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, nowMs: BASE_MS + 600_001 });

    expect(snapshot.lanes[0]?.open).toBe(false);
    expect(snapshot.lanes[0]?.closedReason).toBe('stale');
  });

  it('renders forge facts onto the wire for a lane', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });
    const forge = composeForge({
      'acme/app/101': {
        pr: composePrFacts({ checks: 'passing', review: 'approved' }),
        ticket: {
          title: 'Do it',
          state: 'open',
          url: 'https://x/issues/101',
          createdAt: '2026-07-01T00:00:00Z',
          labels: ['bug'],
        },
        fetchedAt: BASE_TS,
        stale: false,
      },
    });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, forge });

    expect(snapshot.lanes[0]?.forge).toEqual({
      pr: {
        number: 42,
        title: 'Wire it',
        url: 'https://x/pull/42',
        state: 'open',
        isDraft: false,
        checks: 'passing',
        review: 'approved',
      },
      ticket: {
        title: 'Do it',
        state: 'open',
        url: 'https://x/issues/101',
        createdAt: '2026-07-01T00:00:00Z',
        labels: ['bug'],
      },
      fetchedAt: BASE_TS,
      stale: false,
    });
  });

  it('spells an absent check verdict, review decision, and ticket as null so the wire survives a JSON round-trip', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });
    const forge = composeForge({
      'acme/app/101': { pr: composePrFacts(), ticket: undefined, fetchedAt: BASE_TS, stale: true },
    });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, forge });

    expect(snapshot.lanes[0]?.forge).toEqual({
      pr: {
        number: 42,
        title: 'Wire it',
        url: 'https://x/pull/42',
        state: 'open',
        isDraft: false,
        checks: null,
        review: null,
      },
      ticket: null,
      fetchedAt: BASE_TS,
      stale: true,
    });
    // eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round-trip is the behavior under test
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('leaves forge null for a lane with no fetched facts', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.started')] });

    const snapshot = buildSnapshot([lane], DERIVE_INPUT);

    expect(snapshot.lanes[0]?.forge).toBeNull();
  });

  it('mints synthetic PR-<n> attribution for a lane with a pull request but no parsed ticket', () => {
    const lane = composeLane('no-ticket-here', { 'sess-a': [composeEvent('turn.started')] });
    const forge = composeForge({
      'acme/app/no-ticket-here': {
        pr: composePrFacts({ number: 42 }),
        ticket: undefined,
        fetchedAt: BASE_TS,
        stale: false,
      },
    });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, forge });

    expect(snapshot.lanes[0]?.ticketRef).toEqual({ ticketId: 'PR-42', revisit: null });
  });

  it('prefers a branch-parsed ticket ref over synthetic PR attribution', () => {
    const lane = composeLane('984', { 'sess-a': [composeEvent('turn.started')] });
    const forge = composeForge({
      'acme/app/984': { pr: composePrFacts({ number: 42 }), ticket: undefined, fetchedAt: BASE_TS, stale: false },
    });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, forge });

    expect(snapshot.lanes[0]?.ticketRef).toEqual({ ticketId: '984', revisit: null });
  });
});
