import { act, renderHook } from '@testing-library/react';
import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackSource } from '../../playback/playback-controller.ts';
import { usePlayback } from '../usePlayback.ts';

function makeSnapshot(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
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
    ...overrides,
  };
}

function createSource(): PlaybackSource {
  return {
    label: 'Test recording',
    snapshots: [
      makeSnapshot(),
      makeSnapshot({
        phases: {
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
          planning: undefined,
          implementation: undefined,
          parallelReview: undefined,
          review: undefined,
          codeSimplifier: undefined,
          holisticReview: undefined,
        },
      }),
      makeSnapshot({ status: 'completed', completedAt: '2026-01-01T00:10:00Z' }),
    ],
  };
}

describe('usePlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null data and stopped state when no recording is loaded', () => {
    const { result } = renderHook(() => usePlayback(null));

    expect(result.current.data).toBeNull();
    expect(result.current.playbackState).toBe('stopped');
    expect(result.current.snapshotCount).toBe(0);
  });

  it('exposes all control functions', () => {
    const { result } = renderHook(() => usePlayback(createSource()));

    expect(typeof result.current.controls.play).toBe('function');
    expect(typeof result.current.controls.pause).toBe('function');
    expect(typeof result.current.controls.stop).toBe('function');
    expect(typeof result.current.controls.stepForward).toBe('function');
    expect(typeof result.current.controls.stepBackward).toBe('function');
    expect(typeof result.current.controls.faster).toBe('function');
    expect(typeof result.current.controls.slower).toBe('function');
    expect(typeof result.current.controls.resetSpeed).toBe('function');
  });

  it('stepForward produces valid CanonicalRunStatus with correct runId', () => {
    const { result } = renderHook(() => usePlayback(createSource()));

    act(() => {
      result.current.controls.stepForward();
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.runId).toBe('test-run');
  });

  it('stop() sets playbackState to stopped and cursor to -1', () => {
    const { result } = renderHook(() => usePlayback(createSource()));

    act(() => {
      result.current.controls.stepForward();
      result.current.controls.stepForward();
    });
    expect(result.current.cursor).toBeGreaterThanOrEqual(0);

    act(() => {
      result.current.controls.stop();
    });
    expect(result.current.playbackState).toBe('stopped');
    expect(result.current.cursor).toBe(-1);
  });

  it('play() transitions playbackState to playing', () => {
    const { result } = renderHook(() => usePlayback(createSource()));

    act(() => {
      result.current.controls.play();
    });
    expect(result.current.playbackState).toBe('playing');
    expect(result.current.cursor).toBe(0);
  });

  it('disposes old controller when source changes', () => {
    const src1 = createSource();
    const src2: PlaybackSource = {
      ...createSource(),
      snapshots: createSource().snapshots.map((s) => ({ ...s, runId: 'run-2' })),
    };

    const { result, rerender } = renderHook(({ src }: { src: PlaybackSource | null }) => usePlayback(src), {
      initialProps: { src: src1 },
    });

    act(() => {
      result.current.controls.stepForward();
    });
    expect(result.current.data?.runId).toBe('test-run');

    rerender({ src: src2 });

    act(() => {
      result.current.controls.stepForward();
    });
    expect(result.current.data?.runId).toBe('run-2');
  });

  it('disposes controller on unmount', () => {
    const { result, unmount } = renderHook(() => usePlayback(createSource()));

    act(() => {
      result.current.controls.stepForward();
    });

    // Should not throw
    unmount();
  });
});
