import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import type { RunEvent, RunHeader } from '../../../shared/types/run-log.js';
import { PlaybackController } from '../playback-controller.js';

function createHeader(): RunHeader {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
  };
}

function createEvents(): RunEvent[] {
  return [
    { t: '2026-01-01T00:00:00Z', event: 'run_started' },
    { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
    {
      t: '2026-01-01T00:02:00Z',
      event: 'phase_completed',
      phase: 'architecture',
      status: 'completed',
      data: { impactLevel: 'high' },
    },
    { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
  ];
}

describe('PlaybackController', () => {
  let updates: CanonicalRunStatus[];
  let onUpdate: (status: CanonicalRunStatus) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    updates = [];
    onUpdate = (status) => {
      updates.push(status);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in stopped state at cursor -1', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    expect(ctrl.state).toBe('stopped');
    expect(ctrl.cursor).toBe(-1);
    expect(ctrl.speed).toBe(1);
    expect(ctrl.eventCount).toBe(4);
  });

  it('stepForward advances cursor and calls onUpdate', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.stepForward();

    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.runId).toBe('test-run');
    expect(updates[0]?.status).toBe('in_progress');
  });

  it('stepBackward decrements cursor and calls onUpdate', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.stepForward();
    ctrl.stepForward();
    expect(ctrl.cursor).toBe(1);

    ctrl.stepBackward();
    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(3);
  });

  it('stepBackward is a no-op at cursor -1', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.stepBackward();
    expect(ctrl.cursor).toBe(-1);
    expect(updates).toHaveLength(0);
  });

  it('play emits first event immediately and advances via setTimeout', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.setNormalized(false);
    ctrl.play();

    expect(ctrl.state).toBe('playing');
    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(1);

    // Advance past first gap (60s at 1x speed = 60000ms)
    vi.advanceTimersByTime(60_000);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('pause stops scheduling', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.play();
    expect(updates).toHaveLength(1);

    ctrl.pause();
    expect(ctrl.state).toBe('paused');

    vi.advanceTimersByTime(120_000);
    // Should not have advanced
    expect(updates).toHaveLength(1);
  });

  it('stop resets cursor to -1', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.play();
    ctrl.stop();

    expect(ctrl.state).toBe('stopped');
    expect(ctrl.cursor).toBe(-1);
  });

  it('transitions to ended after last event', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.setNormalized(false);
    ctrl.play();

    // Advance through all events
    // Gap 0->1: 60s, 1->2: 60s, 2->3: 480s
    vi.advanceTimersByTime(60_000); // cursor 1
    vi.advanceTimersByTime(60_000); // cursor 2
    vi.advanceTimersByTime(480_000); // cursor 3

    expect(ctrl.cursor).toBe(3);
    expect(ctrl.state).toBe('ended');
    expect(updates).toHaveLength(4);
  });

  it('faster doubles speed and slower halves it', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    expect(ctrl.speed).toBe(1);

    ctrl.faster();
    expect(ctrl.speed).toBe(2);

    ctrl.slower();
    expect(ctrl.speed).toBe(1);
  });

  it('resetSpeed returns to 1x', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.faster();
    ctrl.faster();
    expect(ctrl.speed).toBe(4);

    ctrl.resetSpeed();
    expect(ctrl.speed).toBe(1);
  });

  it('clamps speed at min 0.25 and max 128', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.setSpeed(0.1);
    expect(ctrl.speed).toBe(0.25);

    ctrl.setSpeed(256);
    expect(ctrl.speed).toBe(128);
  });

  it('setSpeed(2) halves inter-event delay', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.setNormalized(false);
    ctrl.setSpeed(2);
    ctrl.play();

    expect(updates).toHaveLength(1);

    // At 2x, 60s gap becomes 30s delay
    vi.advanceTimersByTime(30_000);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('normalization caps gaps larger than 10s to MAX_GAP_MS', () => {
    // Two events separated by 60 seconds
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'run_completed', status: 'completed' },
    ];
    const ctrl = new PlaybackController(createHeader(), events, onUpdate);

    // Default: normalization enabled — 60s gap capped to 10s
    ctrl.play();
    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('without normalization uses actual gap', () => {
    // Two events separated by 60 seconds
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'run_completed', status: 'completed' },
    ];
    const ctrl = new PlaybackController(createHeader(), events, onUpdate);

    ctrl.setNormalized(false);
    ctrl.play();
    expect(ctrl.cursor).toBe(0);

    // At 10s the cursor should NOT have advanced (gap is 60s)
    vi.advanceTimersByTime(10_000);
    expect(ctrl.cursor).toBe(0);

    // At 60s it should advance
    vi.advanceTimersByTime(50_000);
    expect(ctrl.cursor).toBe(1);
  });

  it('play is a no-op when state is ended', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);

    // Step through all events to reach ended state
    for (let i = 0; i < 4; i++) {
      ctrl.stepForward();
    }
    expect(ctrl.state).toBe('ended');
    const updateCount = updates.length;

    ctrl.play();
    expect(ctrl.state).toBe('ended');
    expect(updates).toHaveLength(updateCount);
  });

  it('stepBackward from ended transitions to paused', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);

    // Step through all events to reach ended state
    for (let i = 0; i < 4; i++) {
      ctrl.stepForward();
    }
    expect(ctrl.state).toBe('ended');
    expect(ctrl.cursor).toBe(3);

    ctrl.stepBackward();
    expect(ctrl.state).toBe('paused');
    expect(ctrl.cursor).toBe(2);
  });

  it('dispose cancels pending timeout', () => {
    const ctrl = new PlaybackController(createHeader(), createEvents(), onUpdate);
    ctrl.play();
    expect(updates).toHaveLength(1);

    ctrl.dispose();

    vi.advanceTimersByTime(120_000);
    expect(updates).toHaveLength(1);
  });
});
