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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
});
