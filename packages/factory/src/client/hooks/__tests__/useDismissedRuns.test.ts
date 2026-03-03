import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSettings } from '../../../shared/types/settings.js';
import { silencedConsole } from '../../../test-utils.js';
import { useDismissedRuns } from '../useDismissedRuns.js';

vi.mock('../../api/client.js', () => ({
  fetchSettings: vi.fn(),
  patchSettings: vi.fn(),
}));

const { fetchSettings, patchSettings } = await import('../../api/client.js');
const mockedFetchSettings = vi.mocked(fetchSettings);
const mockedPatchSettings = vi.mocked(patchSettings);

describe('useDismissedRuns', () => {
  beforeEach(() => {
    mockedFetchSettings.mockReset();
    mockedPatchSettings.mockReset();
  });
  it('initializes with empty dismissed record before server responds', () => {
    mockedFetchSettings.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useDismissedRuns());

    expect(result.current.dismissed).toEqual({});
  });

  it('hydrates dismissed from fetchSettings on mount', async () => {
    const settings: UserSettings = {
      dismissedRuns: { 'alpha/T-1/run-a': { status: 'completed' } },
    };
    mockedFetchSettings.mockResolvedValue(settings);

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(result.current.dismissed).toEqual(settings.dismissedRuns);
    });
  });

  it('leaves dismissed as empty on fetchSettings failure', async () => {
    using _silent = silencedConsole();
    mockedFetchSettings.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDismissedRuns());

    // Wait for the rejection to be handled
    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    expect(result.current.dismissed).toEqual({});
  });

  it('dismiss performs optimistic update and calls patchSettings', async () => {
    mockedFetchSettings.mockResolvedValue({ dismissedRuns: {} });
    mockedPatchSettings.mockResolvedValue({ dismissedRuns: { 'alpha/T-1/run-a': { status: 'completed' } } });

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.dismiss('alpha/T-1/run-a', 'completed');
    });

    expect(result.current.dismissed['alpha/T-1/run-a']).toEqual({ status: 'completed' });
    expect(mockedPatchSettings).toHaveBeenCalledWith({
      dismissedRuns: { 'alpha/T-1/run-a': { status: 'completed' } },
    });
  });

  it('dismissAll handles batch case and calls patchSettings with full record', async () => {
    mockedFetchSettings.mockResolvedValue({ dismissedRuns: {} });
    mockedPatchSettings.mockResolvedValue({
      dismissedRuns: {
        'alpha/T-1/run-a': { status: 'completed' },
        'beta/T-2/run-b': { status: 'failed' },
      },
    });

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.dismissAll([
        { key: 'alpha/T-1/run-a', status: 'completed' },
        { key: 'beta/T-2/run-b', status: 'failed' },
      ]);
    });

    expect(result.current.dismissed['alpha/T-1/run-a']).toEqual({ status: 'completed' });
    expect(result.current.dismissed['beta/T-2/run-b']).toEqual({ status: 'failed' });
    expect(mockedPatchSettings).toHaveBeenCalledWith({
      dismissedRuns: {
        'alpha/T-1/run-a': { status: 'completed' },
        'beta/T-2/run-b': { status: 'failed' },
      },
    });
  });

  it('dismissAll with empty entries does not call patchSettings', async () => {
    mockedFetchSettings.mockResolvedValue({ dismissedRuns: {} });

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.dismissAll([]);
    });

    expect(mockedPatchSettings).not.toHaveBeenCalled();
  });

  it('dismiss skips patchSettings when key already has the same status', async () => {
    mockedFetchSettings.mockResolvedValue({
      dismissedRuns: { 'alpha/T-1/run-a': { status: 'completed' } },
    });
    mockedPatchSettings.mockResolvedValue({ dismissedRuns: {} });

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.dismiss('alpha/T-1/run-a', 'completed');
    });

    expect(mockedPatchSettings).not.toHaveBeenCalled();
  });

  it('dismissAll skips patchSettings when all entries already match', async () => {
    mockedFetchSettings.mockResolvedValue({
      dismissedRuns: {
        'alpha/T-1/run-a': { status: 'completed' },
        'beta/T-2/run-b': { status: 'failed' },
      },
    });
    mockedPatchSettings.mockResolvedValue({ dismissedRuns: {} });

    const { result } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.dismissAll([
        { key: 'alpha/T-1/run-a', status: 'completed' },
        { key: 'beta/T-2/run-b', status: 'failed' },
      ]);
    });

    expect(mockedPatchSettings).not.toHaveBeenCalled();
  });

  it('dismiss callback is stable across re-renders', async () => {
    mockedFetchSettings.mockResolvedValue({ dismissedRuns: {} });

    const { result, rerender } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    const firstDismiss = result.current.dismiss;
    rerender();

    expect(result.current.dismiss).toBe(firstDismiss);
  });

  it('dismissAll callback is stable across re-renders', async () => {
    mockedFetchSettings.mockResolvedValue({ dismissedRuns: {} });

    const { result, rerender } = renderHook(() => useDismissedRuns());

    await waitFor(() => {
      expect(mockedFetchSettings).toHaveBeenCalledTimes(1);
    });

    const firstDismissAll = result.current.dismissAll;
    rerender();

    expect(result.current.dismissAll).toBe(firstDismissAll);
  });
});
