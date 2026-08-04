import { describe, expect, it } from 'vitest';

import type { EventEnvelope } from '../envelope.ts';
import {
  applyLaneEvent,
  applySessionEvent,
  createLaneState,
  createSessionState,
  deriveLaneStatus,
  deriveSessionStatus,
  resolveLaneCwd,
  resolveLaneRecency,
  type SessionState,
} from '../fold.ts';

const BASE_TS = '2026-07-19T05:00:00.000Z';
const BASE_MS = Date.parse(BASE_TS);

/** A minimal envelope of the given type; tests override fields as needed. */
function composeEvent(type: string, overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', ts: BASE_TS, type, cwd: '/work/repo', payload: {}, ...overrides };
}

/** Folds `events` into a fresh session. */
function foldSession(events: readonly EventEnvelope[]): SessionState {
  let state = createSessionState();
  for (const event of events) {
    state = applySessionEvent(state, event);
  }
  return state;
}

describe('applySessionEvent', () => {
  it('starts idle and works the turn boundaries', () => {
    expect(createSessionState().phase).toBe('idle');
    expect(foldSession([composeEvent('turn.started')]).phase).toBe('working');
    expect(foldSession([composeEvent('turn.started'), composeEvent('turn.completed')]).phase).toBe('waiting');
  });

  it('ends on session.ended and reopens on a later session.started', () => {
    const ended = foldSession([composeEvent('turn.started'), composeEvent('session.ended')]);
    expect(ended.phase).toBe('ended');

    const resumed = applySessionEvent(ended, composeEvent('session.started'));
    expect(resumed.phase).toBe('idle');
  });

  it('narrates the running skill and clears it on completion', () => {
    const running = foldSession([composeEvent('skill.started', { payload: { skill: 'design-and-plan' } })]);
    expect(running.currentSkill).toBe('design-and-plan');

    expect(applySessionEvent(running, composeEvent('skill.completed')).currentSkill).toBeUndefined();
  });

  it('clears a narration whose skill.completed never arrived at the next turn boundary', () => {
    const running = foldSession([
      composeEvent('turn.started'),
      composeEvent('skill.started', { payload: { skill: 'design-and-plan' } }),
    ]);

    expect(applySessionEvent(running, composeEvent('turn.completed')).currentSkill).toBeUndefined();
  });

  it('does not flip the phase on skill events', () => {
    const state = foldSession([
      composeEvent('turn.started'),
      composeEvent('skill.started', { payload: { skill: 'commit' } }),
      composeEvent('skill.completed'),
    ]);

    expect(state.phase).toBe('working');
  });

  it('takes narration from skill.progress only when none is running', () => {
    const fromProgress = foldSession([composeEvent('skill.progress', { payload: { skill: 'orchestrate' } })]);
    expect(fromProgress.currentSkill).toBe('orchestrate');

    const alreadyRunning = foldSession([
      composeEvent('skill.started', { payload: { skill: 'design-and-plan' } }),
      composeEvent('skill.progress', { payload: { skill: 'orchestrate' } }),
    ]);
    expect(alreadyRunning.currentSkill).toBe('design-and-plan');
  });

  it('retains the ask through turn.completed and clears it when the next turn starts', () => {
    const waiting = foldSession([
      composeEvent('turn.started'),
      composeEvent('input.requested', { payload: { prompt: 'next-steps' } }),
      composeEvent('turn.completed'),
    ]);
    expect(waiting.ask).toEqual({ prompt: 'next-steps' });

    expect(applySessionEvent(waiting, composeEvent('turn.started')).ask).toBeUndefined();
  });

  it('tracks the cwd of the most recent event', () => {
    const state = foldSession([
      composeEvent('turn.started', { cwd: '/work/repo.984' }),
      composeEvent('turn.completed', { cwd: '/work/repo.984.2' }),
    ]);

    expect(state.cwd).toBe('/work/repo.984.2');
  });

  it('keeps the harness from the most recent event that carried one', () => {
    const state = foldSession([composeEvent('session.started', { harness: 'claude' }), composeEvent('turn.started')]);

    expect(state.harness).toBe('claude');
  });

  it('advances recency on an undeclared type without disturbing anything else', () => {
    const working = foldSession([composeEvent('turn.started', { ts: '2026-07-19T04:00:00.000Z' })]);

    const after = applySessionEvent(working, composeEvent('merge.completed'));

    expect(after.phase).toBe('working');
    expect(after.lastEventTs).toBe(BASE_TS);
  });

  it('does not mutate the input state', () => {
    const before = createSessionState();

    applySessionEvent(before, composeEvent('turn.started'));

    expect(before).toEqual(createSessionState());
  });
});

describe('deriveSessionStatus', () => {
  it('marks a working session stale once it goes quiet past the threshold', () => {
    const working = foldSession([composeEvent('turn.started')]);

    const status = deriveSessionStatus(working, { nowMs: BASE_MS + 100_000, staleMs: 90_000 });

    expect(status.stale).toBe(true);
  });

  it('never marks a waiting session stale — quiet is its normal state', () => {
    const waiting = foldSession([composeEvent('turn.started'), composeEvent('turn.completed')]);

    const status = deriveSessionStatus(waiting, { nowMs: BASE_MS + 100_000, staleMs: 90_000 });

    expect(status.stale).toBe(false);
    expect(status.phase).toBe('waiting');
  });
});

describe('createLaneState', () => {
  it('derives ticket attribution from a conforming branch name', () => {
    expect(createLaneState({ repo: 'owner/name', branch: '984.2' }).ticketRef).toEqual({ ticketId: '984', revisit: 2 });
  });

  it('leaves attribution unset for a non-conforming branch name', () => {
    expect(createLaneState({ repo: 'owner/name', branch: 'main' }).ticketRef).toBeUndefined();
  });
});

describe('applyLaneEvent', () => {
  it('creates a session bucket on first sight and folds into it thereafter', () => {
    const lane = createLaneState({ repo: 'owner/name', branch: '984' });

    const one = applyLaneEvent(lane, { sessionId: 'abc', envelope: composeEvent('turn.started') });
    const two = applyLaneEvent(one, { sessionId: 'abc', envelope: composeEvent('turn.completed') });

    expect(two.sessions.abc?.phase).toBe('waiting');
    expect(lane.sessions).toEqual({});
  });
});

describe('deriveLaneStatus', () => {
  const activeLane = applyLaneEvent(createLaneState({ repo: 'owner/name', branch: '984' }), {
    sessionId: 'abc',
    envelope: composeEvent('turn.started'),
  });

  it('closes when a probe reports the worktree gone, regardless of activity', () => {
    const status = deriveLaneStatus(activeLane, {
      nowMs: BASE_MS + 1_000,
      closeAfterMs: 3_600_000,
      probes: { worktreeExists: false },
    });

    expect(status).toEqual({ open: false, closedReason: 'worktree-gone', lastEventTs: BASE_TS });
  });

  it('closes when every session has ended', () => {
    const endedLane = applyLaneEvent(activeLane, { sessionId: 'abc', envelope: composeEvent('session.ended') });

    const status = deriveLaneStatus(endedLane, { nowMs: BASE_MS + 1_000, closeAfterMs: 3_600_000 });

    expect(status.open).toBe(false);
    expect(status.closedReason).toBe('all-sessions-ended');
  });

  it('closes once the whole lane goes quiet past the closure threshold', () => {
    const status = deriveLaneStatus(activeLane, { nowMs: BASE_MS + 7_200_000, closeAfterMs: 3_600_000 });

    expect(status.open).toBe(false);
    expect(status.closedReason).toBe('stale');
  });

  it('stays open with recent activity, a live worktree probe notwithstanding', () => {
    const status = deriveLaneStatus(activeLane, {
      nowMs: BASE_MS + 1_000,
      closeAfterMs: 3_600_000,
      probes: { worktreeExists: true },
    });

    expect(status).toEqual({ open: true, closedReason: undefined, lastEventTs: BASE_TS });
  });

  it('stays open with no events at all', () => {
    const emptyLane = createLaneState({ repo: 'owner/name', branch: '984' });

    const status = deriveLaneStatus(emptyLane, { nowMs: BASE_MS, closeAfterMs: 3_600_000 });

    expect(status).toEqual({ open: true, closedReason: undefined, lastEventTs: undefined });
  });
});

describe('resolveLaneCwd', () => {
  it('returns the cwd of the most recently active session', () => {
    const older = applyLaneEvent(createLaneState({ repo: 'owner/name', branch: '984' }), {
      sessionId: 'older',
      envelope: composeEvent('turn.started', { ts: '2026-07-19T04:00:00.000Z', cwd: '/work/older' }),
    });
    const lane = applyLaneEvent(older, {
      sessionId: 'newer',
      envelope: composeEvent('turn.completed', { ts: '2026-07-19T06:00:00.000Z', cwd: '/work/newer' }),
    });

    expect(resolveLaneCwd(lane)).toBe('/work/newer');
  });

  it('returns undefined for a lane with no events', () => {
    expect(resolveLaneCwd(createLaneState({ repo: 'owner/name', branch: '984' }))).toBeUndefined();
  });
});

describe('resolveLaneRecency', () => {
  it('returns the newest last-event timestamp across the sessions', () => {
    const older = applyLaneEvent(createLaneState({ repo: 'owner/name', branch: '984' }), {
      sessionId: 'older',
      envelope: composeEvent('turn.started', { ts: '2026-07-19T04:00:00.000Z' }),
    });
    const lane = applyLaneEvent(older, {
      sessionId: 'newer',
      envelope: composeEvent('turn.completed', { ts: '2026-07-19T06:00:00.000Z' }),
    });

    expect(resolveLaneRecency(lane)).toBe('2026-07-19T06:00:00.000Z');
  });

  it('returns undefined for a lane with no events', () => {
    expect(resolveLaneRecency(createLaneState({ repo: 'owner/name', branch: '984' }))).toBeUndefined();
  });
});
