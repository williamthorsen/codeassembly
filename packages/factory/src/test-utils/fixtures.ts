import type { CanonicalRunStatus, Phases } from '../shared/types/canonical.js';

export function emptyPhases(): Phases {
  return {
    architecture: undefined,
    planning: undefined,
    implementation: undefined,
    parallelReview: undefined,
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}

export function createMockRunStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
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
    phases: emptyPhases(),
    phaseDecisions: {},
    artifacts: undefined,
    ...overrides,
  };
}

export function createInProgressReviewPhases(): Phases {
  return {
    ...emptyPhases(),
    architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
    implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    parallelReview: {
      status: 'in_progress',
      aggregatedCriticality: undefined,
      reviewRoundsUsed: 0,
      reviewers: {
        'correctness-reviewer': {
          ran: true,
          status: undefined,
          criticality: undefined,
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        },
      },
      coderFixCycleRan: false,
      selectiveReReview: undefined,
      startedAt: '2026-01-01T00:30:00Z',
      iterations: [
        {
          reviewers: ['correctness-reviewer'],
          dispatchedAt: '2026-01-01T00:30:00Z',
        },
      ],
    },
  };
}

export function createCompletedRunPhases(): Phases {
  return {
    architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
    implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    parallelReview: {
      aggregatedCriticality: 'low',
      reviewRoundsUsed: 1,
      reviewers: {
        'correctness-reviewer': {
          ran: true,
          status: 'completed',
          criticality: 'low',
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        },
        'security-reviewer': {
          ran: true,
          status: 'completed',
          criticality: 'low',
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        },
      },
      coderFixCycleRan: false,
      selectiveReReview: undefined,
    },
    review: undefined,
    codeSimplifier: { ran: true, actionableFindings: true, coderFixCycleRan: false, artifact: undefined },
    holisticReview: {
      status: 'completed',
      criticality: 'low',
      reReviewCriticality: undefined,
      coderFixCycleRan: false,
      reviewRoundsUsed: 1,
      artifact: undefined,
    },
  };
}
