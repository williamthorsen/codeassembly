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
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    fixLowFindings: undefined,
    mode: undefined,
    model: undefined,
    phases: emptyPhases(),
    phaseDecisions: {},
    artifacts: undefined,
    ...overrides,
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
      reviewers: {},
      coderFixCycleRan: false,
      selectiveReReview: undefined,
    },
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}
