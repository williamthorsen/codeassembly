import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

const { mockUseRunStatus, mockRunSelector, mockStatusBar, mockGameCanvas } = vi.hoisted(() => {
  return {
    mockUseRunStatus: vi.fn(),
    mockRunSelector: vi.fn(),
    mockStatusBar: vi.fn(),
    mockGameCanvas: vi.fn(),
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

// Stub CSS import
vi.mock('../App.css', () => ({}));

const { App } = await import('../App.js');

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

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockRunSelector.mockImplementation(({ onSelectRun }: { onSelectRun: (slug: string, runId: string) => void }) => (
      <button data-testid="run-selector" onClick={() => onSelectRun('proj-a', 'run-1')}>
        Select run
      </button>
    ));
    mockStatusBar.mockImplementation(({ status }: { status: CanonicalRunStatus }) => (
      <div data-testid="status-bar">{status.runId}</div>
    ));
    mockGameCanvas.mockImplementation(({ status }: { status: CanonicalRunStatus }) => (
      <div data-testid="game-canvas">{status.runId}</div>
    ));
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
    const status = createMockStatus({ runId: 'run-42' });
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
    // The most recent call should have the values passed by the mock RunSelector's onClick.
    expect(mockUseRunStatus).toHaveBeenLastCalledWith('proj-a', 'run-1');
  });

  it('passes null to useRunStatus before any selection', () => {
    mockUseRunStatus.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<App />);

    expect(mockUseRunStatus).toHaveBeenCalledWith(null, null);
  });
});
