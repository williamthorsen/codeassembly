/** Builds a v1 status object in the current format. */
export function buildCurrentFormatFixture(): Record<string, unknown> {
  return {
    runId: '20260225-1323Z-orchestrated',
    projectSlug: 'factory',
    ticketId: '20260225-1239Z-os6e',
    projectRoot: '/repos/projects/factory',
    branch: 'art-1_app_feat-mvp-visualizer',
    task: 'Build the Artifactory Foundation',
    startedAt: '2026-02-25T13:23:00Z',
    status: 'in_progress',
    externalPlan: true,
    mergeBaseSha: '7302522b',
    diffBase: 'origin/next',
    maxReviewRounds: 3,
    phases: {
      architecture: {
        status: 'completed',
        impactLevel: 'high',
        artifact: 'architecture.md',
      },
      planning: {
        status: 'completed',
        stepCount: 7,
        artifacts: ['plan.md', 'plan.json'],
      },
    },
    phaseDecision: {
      architecture: { run: true, reason: 'External plan exists' },
      planning: { run: true, reason: 'External plan exists with 7 steps' },
    },
  };
}

/** Builds a v1 status object in the legacy format. */
export function buildLegacyFormatFixture(): Record<string, unknown> {
  return {
    runId: '20260222-2212Z-orchestrated',
    projectSlug: 'acme-storefront',
    ticketId: 'ACME-1',
    projectRoot: '/repos/clients/acme/storefront',
    branch: 'acme-1_feat_home-page-redesign',
    task: 'Implement GitHub issue #52',
    startedAt: '2026-02-22T22:12:23Z',
    completedAt: '2026-02-22T23:40:57Z',
    status: 'completed',
    phases: {
      architecture: { status: 'completed', impactLevel: 'medium' },
      planning: { status: 'completed', stepCount: 8 },
      implementation: {
        status: 'completed',
        qualityGates: 'all passing (typecheck, lint, tests, format)',
      },
      review: { status: 'approved', iterations: 2, finalCriticality: 'low' },
      holisticReview: {
        status: 'completed',
        criticality: 'low',
      },
    },
    phaseDecision: {
      architecture: { run: true, reason: 'Significant UI redesign' },
      planning: { run: true, reason: 'Multi-file change' },
      implementation: { run: true, reason: 'Always required' },
      review: { run: true, reason: 'Always required' },
    },
  };
}

/** Builds a v2 run index with context, config, and artifacts. */
export function buildV2Fixture(): Record<string, unknown> {
  return {
    version: 2,
    context: {
      runId: '20260226-1400Z-orchestrated',
      projectSlug: 'factory',
      ticketId: 'CODY-3',
      projectRoot: '/repos/projects/factory',
      branch: 'cody-3_feat_run-index-v2',
      task: 'Support run-index.json v2 format',
      startedAt: '2026-02-26T14:00:00Z',
      completedAt: '2026-02-26T15:30:00Z',
      status: 'completed',
      phases: {
        architecture: { status: 'completed', impactLevel: 'medium', artifact: 'architecture.md' },
        planning: { status: 'completed', stepCount: 10, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      },
      phaseDecisions: {
        architecture: { run: true, reason: 'New format support' },
        planning: { run: true, reason: 'Multi-step implementation' },
      },
    },
    config: {
      externalPlan: false,
      mergeBaseSha: 'abc123',
      diffBase: 'origin/main',
      maxReviewRounds: 2,
      mode: 'orchestrated',
      model: 'claude-opus-4-6',
    },
    artifacts: [
      {
        filename: 'architecture.md',
        role: 'Architecture document',
        roleType: 'architecture',
        agent: 'architect',
        type: 'markdown',
        phase: 'architecture',
        createdAt: '2026-02-26T14:05:00Z',
      },
      {
        filename: 'plan.md',
        role: 'Implementation plan',
        roleType: 'plan',
        agent: 'planner',
        type: 'markdown',
        phase: 'planning',
        createdAt: '2026-02-26T14:10:00Z',
        iteration: 1,
        note: 'Initial plan',
      },
    ],
  };
}

export interface MinimalV2 {
  version: number;
  context: Record<string, unknown>;
  config: Record<string, unknown>;
  artifacts?: unknown[];
}

/** Builds the smallest v2 run index that the schema accepts. */
export function minimalV2(): MinimalV2 {
  return {
    version: 2,
    context: {
      runId: 'test-run',
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
      status: 'in_progress',
      phases: {},
    },
    config: {},
  };
}

/** Builds the smallest v1 status object that the schema accepts. */
export function minimalValid(): Record<string, unknown> {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    status: 'in_progress',
    phases: {},
  };
}
