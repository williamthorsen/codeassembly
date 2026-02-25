import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { useRunStatus } from '../useRunStatus.js';

vi.mock('../../api/client.js', () => ({
  fetchRunStatus: vi.fn(),
}));

const { fetchRunStatus } = await import('../../api/client.js');
const mockedFetchRunStatus = vi.mocked(fetchRunStatus);

function createMockStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'completed',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    fixLowFindings: undefined,
    phases: {
      architecture: undefined,
      planning: undefined,
      implementation: undefined,
      parallelReview: undefined,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    phaseDecision: {},
    ...overrides,
  };
}

describe('useRunStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedFetchRunStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null data when no project or run is selected', () => {
    const { result } = renderHook(() => useRunStatus(null, null));

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches run status when project and run are provided', async () => {
    const mockStatus = createMockStatus();
    mockedFetchRunStatus.mockResolvedValue(mockStatus);

    const { result } = renderHook(() => useRunStatus('test', 'test-run'));

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data?.runId).toBe('test-run');
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockedFetchRunStatus.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRunStatus('test', 'test-run'));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('starts polling when status is in_progress', async () => {
    const inProgressStatus = createMockStatus({ status: 'in_progress' });
    mockedFetchRunStatus.mockResolvedValue(inProgressStatus);

    renderHook(() => useRunStatus('test', 'test-run'));

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
    });

    // Advance past the poll interval to trigger a second fetch
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('stops polling when run completes', async () => {
    const inProgressStatus = createMockStatus({ status: 'in_progress' });
    const completedStatus = createMockStatus({ status: 'completed' });

    mockedFetchRunStatus.mockResolvedValueOnce(inProgressStatus).mockResolvedValueOnce(completedStatus);

    renderHook(() => useRunStatus('test', 'test-run'));

    // Wait for first fetch (in_progress) to complete
    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
    });

    // Advance to trigger second fetch which returns completed
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(2);
    });

    // Advance again — no more fetches should happen since polling stopped
    vi.advanceTimersByTime(2000);

    // Small wait to confirm no additional calls were made
    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('does not start polling for completed runs', async () => {
    const completedStatus = createMockStatus({ status: 'completed' });
    mockedFetchRunStatus.mockResolvedValue(completedStatus);

    renderHook(() => useRunStatus('test', 'test-run'));

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
    });

    // Advance well past the poll interval
    vi.advanceTimersByTime(4000);

    // No additional fetches should have been made
    expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
  });

  it('cleans up interval on unmount while polling', async () => {
    const inProgressStatus = createMockStatus({ status: 'in_progress' });
    mockedFetchRunStatus.mockResolvedValue(inProgressStatus);

    const { unmount } = renderHook(() => useRunStatus('test', 'test-run'));

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
    });

    // Unmount while polling is active
    unmount();

    // Advance past the poll interval — no new fetches should occur
    vi.advanceTimersByTime(4000);

    expect(mockedFetchRunStatus).toHaveBeenCalledTimes(1);
  });

  it('restarts polling when switching to a different run', async () => {
    const statusA = createMockStatus({ runId: 'run-a', status: 'in_progress' });
    const statusB = createMockStatus({ runId: 'run-b', status: 'in_progress' });

    mockedFetchRunStatus.mockResolvedValue(statusA);

    const { result, rerender } = renderHook(({ slug, run }: { slug: string; run: string }) => useRunStatus(slug, run), {
      initialProps: { slug: 'proj', run: 'run-a' },
    });

    // Wait for initial fetch of run-a
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data?.runId).toBe('run-a');

    // Switch to run-b — the cleanup should clear the interval and null the ref
    mockedFetchRunStatus.mockResolvedValue(statusB);
    rerender({ slug: 'proj', run: 'run-b' });

    // Wait for the new fetch to complete
    await waitFor(() => {
      expect(result.current.data?.runId).toBe('run-b');
    });

    // Advance past the poll interval to confirm polling works for the new run
    const callsAfterSwitch = mockedFetchRunStatus.mock.calls.length;
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockedFetchRunStatus).toHaveBeenCalledTimes(callsAfterSwitch + 1);
    });
  });

  it('clears stale data and error when switching runs', async () => {
    mockedFetchRunStatus.mockRejectedValueOnce(new Error('First run error'));

    const { result, rerender } = renderHook(({ slug, run }: { slug: string; run: string }) => useRunStatus(slug, run), {
      initialProps: { slug: 'proj', run: 'run-a' },
    });

    // Wait for the error to be set
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('First run error');

    // Switch to run-b with a successful response
    const statusB = createMockStatus({ runId: 'run-b', status: 'completed' });
    mockedFetchRunStatus.mockResolvedValue(statusB);
    rerender({ slug: 'proj', run: 'run-b' });

    // After switching, stale error should be cleared and new data loaded
    await waitFor(() => {
      expect(result.current.data?.runId).toBe('run-b');
    });

    expect(result.current.error).toBeNull();
  });

  it('stops polling when a fetch error occurs', async () => {
    const inProgressStatus = createMockStatus({ status: 'in_progress' });

    // First call succeeds, second call (during polling) fails
    mockedFetchRunStatus
      .mockResolvedValueOnce(inProgressStatus)
      .mockRejectedValueOnce(new Error('Transient failure'));

    const { result } = renderHook(() => useRunStatus('test', 'test-run'));

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    // Advance to trigger the failing poll
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('Transient failure');

    // Stale data is intentionally preserved during transient errors (no setData(null) in catch)
    expect(result.current.data).not.toBeNull();

    // Advance again — polling should have stopped after the error, so no additional fetches
    vi.advanceTimersByTime(4000);
    expect(mockedFetchRunStatus).toHaveBeenCalledTimes(2);
  });
});
