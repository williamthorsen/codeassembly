import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDismissedRuns } from '../useDismissedRuns.js';

describe('useDismissedRuns', () => {
  it('starts with no dismissed runs', () => {
    const { result } = renderHook(() => useDismissedRuns());

    expect(result.current.dismissed.has('alpha/T-1/run-a')).toBe(false);
  });

  it('dismisses a single run', () => {
    const { result } = renderHook(() => useDismissedRuns());

    act(() => {
      result.current.dismiss('alpha/T-1/run-a');
    });

    expect(result.current.dismissed.has('alpha/T-1/run-a')).toBe(true);
    expect(result.current.dismissed.has('alpha/T-1/run-b')).toBe(false);
  });

  it('dismisses multiple runs via dismissAll', () => {
    const { result } = renderHook(() => useDismissedRuns());

    act(() => {
      result.current.dismissAll(['alpha/T-1/run-a', 'beta/T-3/run-d']);
    });

    expect(result.current.dismissed.has('alpha/T-1/run-a')).toBe(true);
    expect(result.current.dismissed.has('beta/T-3/run-d')).toBe(true);
    expect(result.current.dismissed.has('alpha/T-2/run-c')).toBe(false);
  });

  it('exposes dismissed set for direct access', () => {
    const { result } = renderHook(() => useDismissedRuns());

    act(() => {
      result.current.dismiss('alpha/T-1/run-a');
    });

    expect(result.current.dismissed.has('alpha/T-1/run-a')).toBe(true);
    expect(result.current.dismissed.has('alpha/T-1/run-b')).toBe(false);
  });

  it('dismissed set reference is stable when dismissing the same key twice', () => {
    const { result } = renderHook(() => useDismissedRuns());

    act(() => {
      result.current.dismiss('alpha/T-1/run-a');
    });

    const setAfterFirst = result.current.dismissed;

    act(() => {
      result.current.dismiss('alpha/T-1/run-a');
    });

    // dismissed set reference should be stable when the set does not change
    expect(result.current.dismissed).toBe(setAfterFirst);
    expect(result.current.dismissed.has('alpha/T-1/run-a')).toBe(true);
  });

  it('dismiss callback is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useDismissedRuns());

    const firstDismiss = result.current.dismiss;
    rerender();

    expect(result.current.dismiss).toBe(firstDismiss);
  });

  it('dismissAll callback is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useDismissedRuns());

    const firstDismissAll = result.current.dismissAll;
    rerender();

    expect(result.current.dismissAll).toBe(firstDismissAll);
  });
});
