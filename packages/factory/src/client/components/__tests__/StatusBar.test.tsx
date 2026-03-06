import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';

// Stub CSS import
vi.mock('../StatusBar.css', () => ({}));

const { StatusBar } = await import('../StatusBar.js');

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
    reason: undefined,
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    phases: {
      architecture: undefined,
      planning: undefined,
      implementation: undefined,
      parallelReview: undefined,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    mode: undefined,
    model: undefined,
    phaseDecisions: {},
    artifacts: undefined,
    ...overrides,
  };
}

describe('StatusBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders project, ticket, runId, and status', () => {
    const status = createMockStatus({
      projectSlug: 'my-project',
      ticketId: 'PROJ-42',
      runId: 'abc-123',
      status: 'in_progress',
    });

    render(<StatusBar status={status} />);

    expect(screen.getByText('my-project')).toBeInTheDocument();
    expect(screen.getByText('PROJ-42')).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
  });

  it('does not display ticket when ticketId is undefined', () => {
    const status = createMockStatus({ ticketId: undefined });

    const { container } = render(<StatusBar status={status} />);

    expect(container.textContent).not.toContain('Ticket:');
  });

  it('calculates and displays duration when completedAt exists', () => {
    const status = createMockStatus({
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:05:30Z',
    });

    render(<StatusBar status={status} />);

    // 5 minutes and 30 seconds = 330 seconds
    expect(screen.getByText('330s')).toBeInTheDocument();
  });

  it('does not display duration when completedAt is undefined', () => {
    const status = createMockStatus({
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: undefined,
    });

    const { container } = render(<StatusBar status={status} />);

    // Verify the component rendered (sanity check)
    expect(screen.getByText('test-run')).toBeInTheDocument();

    // The Duration span should not be rendered when completedAt is undefined
    expect(container.textContent).not.toContain('Duration:');
  });

  it('displays zero duration when startedAt and completedAt are the same', () => {
    const status = createMockStatus({
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:00Z',
    });

    render(<StatusBar status={status} />);

    expect(screen.getByText('0s')).toBeInTheDocument();
  });

  it('displays failure reason when status is failed and reason is present', () => {
    const status = createMockStatus({
      status: 'failed',
      reason: 'quality gates failed',
    });

    render(<StatusBar status={status} />);

    expect(screen.getByText('quality gates failed')).toBeInTheDocument();
  });

  it('does not display reason when reason is undefined', () => {
    const status = createMockStatus({
      status: 'failed',
      reason: undefined,
    });

    const { container } = render(<StatusBar status={status} />);

    expect(container.textContent).not.toContain('Reason:');
  });
});
