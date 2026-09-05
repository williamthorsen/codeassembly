import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moderatelyComplexRun } from '../../demo/recordings/moderately-complex-run.ts';
import { useDemoMode } from '../useDemoMode.ts';

describe('useDemoMode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initially isActive is false and data is null', () => {
    const { result } = renderHook(() => useDemoMode());

    expect(result.current.isActive).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('recordings has at least one entry', () => {
    const { result } = renderHook(() => useDemoMode());

    expect(result.current.recordings.length).toBeGreaterThanOrEqual(1);
  });

  it('loadRecording activates demo mode', () => {
    const { result } = renderHook(() => useDemoMode());

    act(() => {
      result.current.loadRecording(moderatelyComplexRun);
    });

    expect(result.current.isActive).toBe(true);
  });

  it('stopDemo deactivates demo mode and clears data', () => {
    const { result } = renderHook(() => useDemoMode());

    act(() => {
      result.current.loadRecording(moderatelyComplexRun);
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.stopDemo();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('exposes playbackState, controls, speed, cursor, snapshotCount', () => {
    const { result } = renderHook(() => useDemoMode());

    expect(result.current.playbackState).toBe('stopped');
    expect(result.current.speed).toBe(1);
    expect(result.current.cursor).toBe(-1);
    expect(result.current.snapshotCount).toBe(0);
    expect(typeof result.current.controls.play).toBe('function');
  });
});
