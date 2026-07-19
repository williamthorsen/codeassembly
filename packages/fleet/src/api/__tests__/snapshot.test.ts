import { applyLaneEvent, createLaneState, type EventEnvelope, type LaneState } from '@codeassembly/lifecycle';
import { assert, describe, expect, it } from 'vitest';

import { buildSnapshot } from '../snapshot.ts';

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

  it('closes a lane whose sessions have all gone quiet past the closure threshold', () => {
    const lane = composeLane('101', { 'sess-a': [composeEvent('turn.completed')] });

    const snapshot = buildSnapshot([lane], { ...DERIVE_INPUT, nowMs: BASE_MS + 600_001 });

    expect(snapshot.lanes[0]?.open).toBe(false);
    expect(snapshot.lanes[0]?.closedReason).toBe('stale');
  });
});
