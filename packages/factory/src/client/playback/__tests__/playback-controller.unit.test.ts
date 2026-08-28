import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackController } from '../playback-controller.js';

function createSnapshots(): CanonicalRunStatus[] {
  const base: CanonicalRunStatus = {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'in_progress',
    reason: undefined,
    waitingForInput: undefined,
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
    phases: {
      architecture: undefined,
      planning: undefined,
      implementation: undefined,
      parallelReview: undefined,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    phaseDecisions: {},
    artifacts: [],
  };
  return [
    { ...base },
    {
      ...base,
      phases: { ...base.phases, architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined } },
    },
    {
      ...base,
      phases: {
        ...base.phases,
        architecture: { status: 'completed', impactLevel: 'medium', artifact: 'architecture.md' },
      },
    },
    {
      ...base,
      status: 'completed',
      completedAt: '2026-01-01T00:10:00Z',
      phases: {
        ...base.phases,
        architecture: { status: 'completed', impactLevel: 'medium', artifact: 'architecture.md' },
      },
    },
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
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    expect(ctrl.state).toBe('stopped');
    expect(ctrl.cursor).toBe(-1);
    expect(ctrl.speed).toBe(1);
    expect(ctrl.snapshotCount).toBe(4);
  });

  it('stepForward advances cursor and calls onUpdate', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.stepForward();

    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.runId).toBe('test-run');
    expect(updates[0]?.status).toBe('in_progress');
  });

  it('stepBackward decrements cursor and calls onUpdate', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.stepForward();
    ctrl.stepForward();
    expect(ctrl.cursor).toBe(1);

    ctrl.stepBackward();
    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(3);
  });

  it('stepBackward is a no-op at cursor -1', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.stepBackward();
    expect(ctrl.cursor).toBe(-1);
    expect(updates).toHaveLength(0);
  });

  it('play emits first snapshot immediately and advances via setTimeout', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();

    expect(ctrl.state).toBe('playing');
    expect(ctrl.cursor).toBe(0);
    expect(updates).toHaveLength(1);

    // Base interval at 1x = 1500ms
    vi.advanceTimersByTime(1_500);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('pause stops scheduling', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();
    expect(updates).toHaveLength(1);

    ctrl.pause();
    expect(ctrl.state).toBe('paused');

    vi.advanceTimersByTime(10_000);
    // Should not have advanced
    expect(updates).toHaveLength(1);
  });

  it('play() from paused re-emits current snapshot before advancing', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();

    // Advance to cursor 1
    vi.advanceTimersByTime(1_500);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);

    ctrl.pause();
    expect(ctrl.state).toBe('paused');
    const countAfterPause = updates.length;

    // Resume: should re-emit snapshot at cursor 1 immediately
    ctrl.play();
    expect(updates).toHaveLength(countAfterPause + 1);

    // After 1500ms, should advance to cursor 2
    vi.advanceTimersByTime(1_500);
    expect(ctrl.cursor).toBe(2);
    expect(updates).toHaveLength(countAfterPause + 2);
  });

  it('stop resets cursor to -1', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();
    ctrl.stop();

    expect(ctrl.state).toBe('stopped');
    expect(ctrl.cursor).toBe(-1);
  });

  it('transitions to ended after last snapshot', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();

    // 4 snapshots: first emitted immediately, then 3 more at 1500ms intervals
    vi.advanceTimersByTime(1_500); // cursor 1
    vi.advanceTimersByTime(1_500); // cursor 2
    vi.advanceTimersByTime(1_500); // cursor 3

    expect(ctrl.cursor).toBe(3);
    expect(ctrl.state).toBe('ended');
    expect(updates).toHaveLength(4);
  });

  it('faster doubles speed and slower halves it', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    expect(ctrl.speed).toBe(1);

    ctrl.faster();
    expect(ctrl.speed).toBe(2);

    ctrl.slower();
    expect(ctrl.speed).toBe(1);
  });

  it('resetSpeed returns to 1x', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.faster();
    ctrl.faster();
    expect(ctrl.speed).toBe(4);

    ctrl.resetSpeed();
    expect(ctrl.speed).toBe(1);
  });

  it('clamps speed at min 0.25 and max 32', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.setSpeed(0.1);
    expect(ctrl.speed).toBe(0.25);

    ctrl.setSpeed(256);
    expect(ctrl.speed).toBe(32);
  });

  it('setSpeed(2) halves inter-snapshot delay', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.setSpeed(2);
    ctrl.play();

    expect(updates).toHaveLength(1);

    // At 2x, 1500ms base becomes 750ms
    vi.advanceTimersByTime(750);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('enforces minimum interval floor at high speed', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.setSpeed(32);
    ctrl.play();

    expect(updates).toHaveLength(1);

    // At 32x, 1500/32 = 46.875ms, clamped to 300ms
    vi.advanceTimersByTime(299);
    expect(ctrl.cursor).toBe(0);

    vi.advanceTimersByTime(1);
    expect(ctrl.cursor).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('play is a no-op when state is ended', () => {
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);

    // Step through all snapshots to reach ended state
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
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);

    // Step through all snapshots to reach ended state
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
    const ctrl = new PlaybackController(createSnapshots(), onUpdate);
    ctrl.play();
    expect(updates).toHaveLength(1);

    ctrl.dispose();

    vi.advanceTimersByTime(10_000);
    expect(updates).toHaveLength(1);
  });

  it('transitions to ended immediately for an empty snapshot array', () => {
    const ctrl = new PlaybackController([], onUpdate);
    ctrl.play();

    expect(ctrl.state).toBe('ended');
    expect(updates).toHaveLength(0);
  });
});
