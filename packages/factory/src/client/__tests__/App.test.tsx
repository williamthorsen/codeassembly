import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../__test-helpers__/fixtures.js';
import type { FlatRunInfo, ProjectIndex } from '../../shared/types/api.js';
import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

const {
  mockUseRunStatus,
  mockRunSelector,
  mockStatusBar,
  mockGameCanvas,
  mockFetchProjects,
  mockFlattenProjectIndex,
  mockUseDismissedRuns,
  mockRunList,
} = vi.hoisted(() => {
  return {
    mockUseRunStatus: vi.fn(),
    mockRunSelector: vi.fn(),
    mockStatusBar: vi.fn(),
    mockGameCanvas: vi.fn(),
    mockFetchProjects: vi.fn<() => Promise<ProjectIndex>>(),
    mockFlattenProjectIndex: vi.fn<(index: ProjectIndex | null) => FlatRunInfo[]>(),
    mockUseDismissedRuns: vi.fn(),
    mockRunList: vi.fn(),
  };
});

vi.mock('../hooks/useRunStatus.js', () => ({
  useRunStatus: mockUseRunStatus,
}));

vi.mock('../components/RunSelector.js', () => ({
  RunSelector: mockRunSelector,
}));

vi.mock('../components/StatusBar.js', () => ({
  StatusBar: mockStatusBar,
}));

vi.mock('../components/GameCanvas.js', () => ({
  GameCanvas: mockGameCanvas,
}));

vi.mock('../api/client.js', () => ({
  fetchProjects: mockFetchProjects,
}));

vi.mock('../helpers/flatten-project-index.js', () => ({
  flattenProjectIndex: mockFlattenProjectIndex,
}));

vi.mock('../hooks/useDismissedRuns.js', () => ({
  useDismissedRuns: mockUseDismissedRuns,
}));

vi.mock('../components/RunList.js', () => ({
  RunList: mockRunList,
}));

// Stub CSS import
vi.mock('../App.css', () => ({}));

const { App } = await import('../App.js');

describe('App', () => {
  const mockDismiss = vi.fn();
  const mockDismissAll = vi.fn();
  let mockDismissedRecord: Record<string, { status: string }>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDismissedRecord = {};
    mockFetchProjects.mockResolvedValue({ projects: [] });
    mockFlattenProjectIndex.mockReturnValue([]);
    mockUseDismissedRuns.mockReturnValue({
      dismissed: mockDismissedRecord,
      dismiss: mockDismiss,
      dismissAll: mockDismissAll,
    });
    mockRunSelector.mockImplementation(
      ({ onSelectRun }: { index: ProjectIndex | null; onSelectRun: (slug: string, runId: string) => void }) => (
        <button data-testid="run-selector" onClick={() => onSelectRun('proj-a', 'run-1')}>
          Select run
        </button>
      ),
    );
    mockStatusBar.mockImplementation(({ status }: { status: CanonicalRunStatus }) => (
      <div data-testid="status-bar">{status.runId}</div>
    ));
    mockGameCanvas.mockImplementation(({ status }: { status: CanonicalRunStatus }) => (
      <div data-testid="game-canvas">{status.runId}</div>
    ));
    mockRunList.mockImplementation(() => <div data-testid="run-list" />);
  });

  it('displays loading state during useRunStatus loading', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: true, error: null });

    const { container } = render(<App />);
    const view = within(container);

    expect(view.getByText('Loading...')).toBeInTheDocument();
    expect(view.queryByTestId('status-bar')).not.toBeInTheDocument();
    expect(view.queryByTestId('game-canvas')).not.toBeInTheDocument();
  });

  it('displays error state when useRunStatus returns error', () => {
    mockUseRunStatus.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network failure'),
    });

    const { container } = render(<App />);
    const view = within(container);

    expect(view.getByText('Error: Network failure')).toBeInTheDocument();
    expect(view.queryByTestId('status-bar')).not.toBeInTheDocument();
  });

  it('renders StatusBar and GameCanvas when runStatus exists', () => {
    const status = createMockRunStatus({ runId: 'run-42' });
    mockUseRunStatus.mockReturnValue({ data: status, isLoading: false, error: null });

    const { container } = render(<App />);
    const view = within(container);

    expect(view.getByTestId('status-bar')).toHaveTextContent('run-42');
    expect(view.getByTestId('game-canvas')).toHaveTextContent('run-42');
    expect(view.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('updates state when RunSelector callback fires', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const { container } = render(<App />);
    const view = within(container);

    fireEvent.click(view.getByTestId('run-selector'));

    // After clicking, useRunStatus should have been called with the new project/run values.
    expect(mockUseRunStatus).toHaveBeenLastCalledWith('proj-a', 'run-1');
  });

  it('passes null to useRunStatus before any selection', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<App />);

    expect(mockUseRunStatus).toHaveBeenCalledWith(null, null);
  });

  it('fetches projects on mount and passes index to RunSelector', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const projectIndex: ProjectIndex = { projects: [{ slug: 'alpha', tickets: [] }] };
    mockFetchProjects.mockResolvedValue(projectIndex);

    render(<App />);

    await waitFor(() => {
      const lastCall = mockRunSelector.mock.lastCall;
      expect(lastCall?.[0]).toEqual(expect.objectContaining({ index: projectIndex }));
    });
  });

  it('renders RunList component', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const { container } = render(<App />);
    const view = within(container);

    expect(view.getByTestId('run-list')).toBeInTheDocument();
  });

  it('passes visible runs to RunList after filtering dismissed', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const runs: FlatRunInfo[] = [
      {
        projectSlug: 'alpha',
        ticketId: 'T-1',
        runId: 'run-a',
        status: 'completed',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: undefined,
      },
      {
        projectSlug: 'alpha',
        ticketId: 'T-1',
        runId: 'run-b',
        status: 'failed',
        startedAt: '2026-01-02T00:00:00Z',
        completedAt: undefined,
      },
    ];
    mockFlattenProjectIndex.mockReturnValue(runs);
    mockDismissedRecord = { 'alpha/T-1/run-a': { status: 'completed' } };
    mockUseDismissedRuns.mockReturnValue({
      dismissed: mockDismissedRecord,
      dismiss: mockDismiss,
      dismissAll: mockDismissAll,
    });

    render(<App />);

    await waitFor(() => {
      const lastCall = mockRunList.mock.lastCall;
      expect(lastCall?.[0]).toEqual(expect.objectContaining({ runs: [runs[1]] }));
    });
  });

  it('shows a dismissed run when its status has changed since dismissal', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const runs: FlatRunInfo[] = [
      {
        projectSlug: 'alpha',
        ticketId: 'T-1',
        runId: 'run-a',
        status: 'completed',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: undefined,
      },
      {
        projectSlug: 'beta',
        ticketId: 'T-2',
        runId: 'run-b',
        status: 'completed',
        startedAt: '2026-01-02T00:00:00Z',
        completedAt: undefined,
      },
    ];
    mockFlattenProjectIndex.mockReturnValue(runs);

    // run-a was dismissed when it had 'failed' status, but now shows 'completed' — should reappear
    // run-b was dismissed with 'completed' status and still has 'completed' — stays hidden
    mockDismissedRecord = {
      'alpha/T-1/run-a': { status: 'failed' },
      'beta/T-2/run-b': { status: 'completed' },
    };
    mockUseDismissedRuns.mockReturnValue({
      dismissed: mockDismissedRecord,
      dismiss: mockDismiss,
      dismissAll: mockDismissAll,
    });

    render(<App />);

    await waitFor(() => {
      const lastCall = mockRunList.mock.lastCall;
      expect(lastCall?.[0]).toEqual(expect.objectContaining({ runs: [runs[0]] }));
    });
  });

  it('handles fetchProjects error', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
    mockFetchProjects.mockRejectedValue(new Error('Server down'));

    const { container } = render(<App />);
    const view = within(container);

    await waitFor(() => {
      expect(view.getByText('Server down')).toBeInTheDocument();
    });
  });

  it('RunList onSelectRun updates state and triggers useRunStatus', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
    mockRunList.mockImplementation(({ onSelectRun }: { onSelectRun: (projectSlug: string, runId: string) => void }) => (
      <button data-testid="run-list-select" onClick={() => onSelectRun('beta', 'run-x')}>
        Select from list
      </button>
    ));

    const { container } = render(<App />);
    const view = within(container);

    fireEvent.click(view.getByTestId('run-list-select'));

    expect(mockUseRunStatus).toHaveBeenLastCalledWith('beta', 'run-x');
  });

  it('handles fetchProjects rejection with non-Error value', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
    mockFetchProjects.mockRejectedValue('connection refused');

    const { container } = render(<App />);
    const view = within(container);

    await waitFor(() => {
      expect(view.getByText('Failed to load projects')).toBeInTheDocument();
    });
  });

  it('selectedRunKey is null when selectedRun does not match any run in the project', async () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const projectIndex: ProjectIndex = {
      projects: [
        {
          slug: 'alpha',
          tickets: [
            {
              ticketId: 'T-1',
              runs: [
                {
                  runId: 'run-a',
                  path: '/a',
                  status: 'completed',
                  startedAt: '2026-01-01T00:00:00Z',
                  completedAt: undefined,
                },
              ],
            },
          ],
        },
      ],
    };
    mockFetchProjects.mockResolvedValue(projectIndex);

    // Mock RunSelector to select a non-existent run in the 'alpha' project
    mockRunSelector.mockImplementation(
      ({ onSelectRun }: { index: ProjectIndex | null; onSelectRun: (slug: string, runId: string) => void }) => (
        <button data-testid="run-selector" onClick={() => onSelectRun('alpha', 'non-existent-run')}>
          Select run
        </button>
      ),
    );

    const { container } = render(<App />);
    const view = within(container);

    // Wait for the project index to load
    await waitFor(() => {
      const lastSelectorCall = mockRunSelector.mock.lastCall;
      expect(lastSelectorCall?.[0]).toEqual(expect.objectContaining({ index: projectIndex }));
    });

    // Select a run that does not exist in the project
    fireEvent.click(view.getByTestId('run-selector'));

    // RunList should receive null for selectedRunKey
    await waitFor(() => {
      const lastRunListCall = mockRunList.mock.lastCall;
      expect(lastRunListCall?.[0]).toEqual(expect.objectContaining({ selectedRunKey: null }));
    });
  });

  it('dismiss callback wired to RunList onDismissRun', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
    mockRunList.mockImplementation(({ onDismissRun }: { onDismissRun: (key: string, status: string) => void }) => (
      <button data-testid="dismiss-btn" onClick={() => onDismissRun('alpha/T-1/run-a', 'completed')}>
        Dismiss
      </button>
    ));

    const { container } = render(<App />);
    const view = within(container);

    fireEvent.click(view.getByTestId('dismiss-btn'));

    expect(mockDismiss).toHaveBeenCalledWith('alpha/T-1/run-a', 'completed');
  });

  it('handleDismissAll calls dismissAll with all visible run keys', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    const runs: FlatRunInfo[] = [
      {
        projectSlug: 'alpha',
        ticketId: 'T-1',
        runId: 'run-a',
        status: 'completed',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: undefined,
      },
      {
        projectSlug: 'beta',
        ticketId: 'T-2',
        runId: 'run-b',
        status: 'failed',
        startedAt: '2026-01-02T00:00:00Z',
        completedAt: undefined,
      },
    ];
    mockFlattenProjectIndex.mockReturnValue(runs);

    mockRunList.mockImplementation(({ onDismissAll }: { onDismissAll: () => void }) => (
      <button data-testid="dismiss-all-btn" onClick={onDismissAll}>
        Clear all
      </button>
    ));

    const { container } = render(<App />);
    const view = within(container);

    fireEvent.click(view.getByTestId('dismiss-all-btn'));

    expect(mockDismissAll).toHaveBeenCalledWith([
      { key: 'alpha/T-1/run-a', status: 'completed' },
      { key: 'beta/T-2/run-b', status: 'failed' },
    ]);
  });

  it('handleDismissAll with empty visibleRuns calls dismissAll with empty array', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
    mockFlattenProjectIndex.mockReturnValue([]);

    mockRunList.mockImplementation(({ onDismissAll }: { onDismissAll: () => void }) => (
      <button data-testid="dismiss-all-btn" onClick={onDismissAll}>
        Clear all
      </button>
    ));

    const { container } = render(<App />);
    const view = within(container);

    fireEvent.click(view.getByTestId('dismiss-all-btn'));

    expect(mockDismissAll).toHaveBeenCalledWith([]);
  });

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls for project updates every 5 seconds', async () => {
      mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

      render(<App />);

      await waitFor(() => {
        expect(mockFetchProjects).toHaveBeenCalledOnce();
      });

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetchProjects).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetchProjects).toHaveBeenCalledTimes(3);
    });

    it('silently ignores poll fetch errors', async () => {
      mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });
      mockFetchProjects.mockResolvedValueOnce({ projects: [] });

      const { container } = render(<App />);
      const view = within(container);

      await waitFor(() => {
        expect(mockFetchProjects).toHaveBeenCalledOnce();
      });

      // Next poll fails
      mockFetchProjects.mockRejectedValueOnce(new Error('Network error'));
      await vi.advanceTimersByTimeAsync(5000);

      // Should not display the poll error
      expect(view.queryByText('Network error')).not.toBeInTheDocument();
    });
  });
});
