import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunEvent, RunHeader } from '../../../shared/types/run-log.js';
import { silencedConsole } from '../../../test-utils/silenced-console.ts';
import { useRunPlayback } from '../useRunPlayback.js';

const { mockedFetchRunEvents } = vi.hoisted(() => ({
  mockedFetchRunEvents: vi.fn(),
}));

vi.mock('../../api/client.js', () => ({
  fetchRunEvents: mockedFetchRunEvents,
}));

const header: RunHeader = {
  runId: 'run-1',
  projectSlug: 'proj',
  ticketId: undefined,
  projectRoot: '/test',
  branch: 'main',
  task: 'test task',
  startedAt: '2026-01-01T00:00:00Z',
  externalPlan: undefined,
  mergeBaseSha: undefined,
  diffBase: undefined,
  maxReviewRounds: undefined,
  effort: undefined,
  approvalThreshold: undefined,
  budgetThreshold: undefined,
  mode: undefined,
  model: undefined,
};

const events: RunEvent[] = [
  { t: '2026-01-01T00:00:00Z', event: 'run_started' },
  { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
  { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
];

describe(useRunPlayback, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns inactive state initially', () => {
    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    expect(result.current.isActive).toBe(false);
    expect(result.current.playbackState).toBe('stopped');
    expect(result.current.error).toBeNull();
  });

  it('fetches events and sets active source on startReplay', async () => {
    mockedFetchRunEvents.mockResolvedValueOnce({ header, events });

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    expect(mockedFetchRunEvents).toHaveBeenCalledWith('proj', 'run-1');
    expect(result.current.snapshotCount).toBe(3);
  });

  it('does nothing when projectSlug is null', () => {
    const { result } = renderHook(() => useRunPlayback(null, 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    expect(mockedFetchRunEvents).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });

  it('does nothing when runId is null', () => {
    const { result } = renderHook(() => useRunPlayback('proj', null));

    act(() => {
      result.current.startReplay();
    });

    expect(mockedFetchRunEvents).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });

  it('is a no-op when the same run is already loaded', async () => {
    mockedFetchRunEvents.mockResolvedValueOnce({ header, events });

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    // Call startReplay again for the same run
    act(() => {
      result.current.startReplay();
    });

    // Should not have fetched a second time
    expect(mockedFetchRunEvents).toHaveBeenCalledTimes(1);
  });

  it('clears active source on stopReplay', async () => {
    mockedFetchRunEvents.mockResolvedValueOnce({ header, events });

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      result.current.stopReplay();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.playbackState).toBe('stopped');
  });

  it('discards stale fetch responses when stopReplay is called before fetch resolves', async () => {
    const deferred = Promise.withResolvers<{ header: RunHeader; events: RunEvent[] }>();
    mockedFetchRunEvents.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    // Stop before fetch resolves
    act(() => {
      result.current.stopReplay();
    });

    // Resolve the fetch outside act, then let waitFor flush React updates
    deferred.resolve({ header, events });

    // Give the microtask queue time to process
    await waitFor(() => {
      // The stale response should be discarded — isActive must remain false
      expect(result.current.isActive).toBe(false);
    });
  });

  it('sets error on fetch failure', async () => {
    using _silent = silencedConsole(['error']);
    mockedFetchRunEvents.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });

    expect(result.current.isActive).toBe(false);
  });

  it('reports the thrown value when the rejection is not an Error', async () => {
    using _silent = silencedConsole(['error']);
    mockedFetchRunEvents.mockRejectedValueOnce('connection refused');

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('connection refused');
    });
  });

  it('clears error on subsequent successful startReplay', async () => {
    using _silent = silencedConsole(['error']);
    mockedFetchRunEvents.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });

    // Now succeed with a different run (same run is cached as "loaded" only on success)
    mockedFetchRunEvents.mockResolvedValueOnce({ header, events });

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.isActive).toBe(true);
    });
  });

  it('clears error on stopReplay', async () => {
    using _silent = silencedConsole(['error']);
    mockedFetchRunEvents.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRunPlayback('proj', 'run-1'));

    act(() => {
      result.current.startReplay();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });

    act(() => {
      result.current.stopReplay();
    });

    expect(result.current.error).toBeNull();
  });
});
