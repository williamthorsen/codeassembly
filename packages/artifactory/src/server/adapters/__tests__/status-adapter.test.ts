import { describe, expect, it, vi } from 'vitest';

import { parseStatusFile } from '../status-adapter.js';

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile },
  readFile: mockedReadFile,
}));

const currentFormatFixture = JSON.stringify({
  runId: '20260225-1323Z-orchestrated',
  projectSlug: 'artifactory',
  ticketId: '20260225-1239Z-os6e',
  projectRoot: '/Users/william/repos/projects/artifactory',
  branch: 'art-1_app_feat-mvp-visualizer',
  task: 'Build the Artifactory Foundation',
  startedAt: '2026-02-25T13:23:00Z',
  status: 'in_progress',
  externalPlan: true,
  mergeBaseSha: '7302522b',
  diffBase: 'origin/next',
  maxReviewRounds: 3,
  fixLowFindings: true,
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
});

const legacyFormatFixture = JSON.stringify({
  runId: '20260222-2212Z-orchestrated',
  projectSlug: 'researchanddesire-rad-app',
  ticketId: 'RAD-1',
  projectRoot: '/Users/william/repos/clients/rad/rad-app',
  branch: 'rad-1_feat_home-page-redesign',
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
      lateStageFixNeeded: false,
    },
  },
  phaseDecision: {
    architecture: { run: true, reason: 'Significant UI redesign' },
    planning: { run: true, reason: 'Multi-file change' },
    implementation: { run: true, reason: 'Always required' },
    review: { run: true, reason: 'Always required' },
  },
});

describe('parseStatusFile', () => {
  it('parses current format status.json', async () => {
    mockedReadFile.mockResolvedValue(currentFormatFixture);

    const result = await parseStatusFile('/path/to/status.json');

    expect(result.runId).toBe('20260225-1323Z-orchestrated');
    expect(result.projectSlug).toBe('artifactory');
    expect(result.status).toBe('in_progress');
    expect(result.phases.architecture?.status).toBe('completed');
    expect(result.phases.planning?.stepCount).toBe(7);
  });

  it('parses legacy V1 format with review phase', async () => {
    mockedReadFile.mockResolvedValue(legacyFormatFixture);

    const result = await parseStatusFile('/path/to/status.json');

    expect(result.runId).toBe('20260222-2212Z-orchestrated');
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe('2026-02-22T23:40:57Z');
    expect(result.phases.review?.status).toBe('approved');
    expect(result.phases.review?.iterations).toBe(2);
    expect(result.phases.review?.finalCriticality).toBe('low');
  });

  it('throws on invalid JSON', async () => {
    mockedReadFile.mockResolvedValue('not json');

    await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow();
  });

  it('throws on missing required fields', async () => {
    const incomplete = JSON.stringify({
      runId: 'test',
      // missing other required fields
    });
    mockedReadFile.mockResolvedValue(incomplete);

    await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
      'Invalid status.json at /path/to/status.json',
    );
  });

  it('throws when phases is missing', async () => {
    const noPhases = JSON.stringify({
      runId: 'test',
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      task: 'test',
      startedAt: '2026-01-01',
      status: 'completed',
      // missing phases
    });
    mockedReadFile.mockResolvedValue(noPhases);

    await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
      'Invalid status.json at /path/to/status.json',
    );
  });
});
