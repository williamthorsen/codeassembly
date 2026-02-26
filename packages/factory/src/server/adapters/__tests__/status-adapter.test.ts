import { describe, expect, it, vi } from 'vitest';

import { parseStatusFile } from '../status-adapter.js';

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile },
  readFile: mockedReadFile,
}));

const currentFormatFixture = {
  runId: '20260225-1323Z-orchestrated',
  projectSlug: 'factory',
  ticketId: '20260225-1239Z-os6e',
  projectRoot: '/Users/william/repos/projects/factory',
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
};

const legacyFormatFixture = {
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
    },
  },
  phaseDecision: {
    architecture: { run: true, reason: 'Significant UI redesign' },
    planning: { run: true, reason: 'Multi-file change' },
    implementation: { run: true, reason: 'Always required' },
    review: { run: true, reason: 'Always required' },
  },
};

function mockJson(data: Record<string, unknown>): void {
  mockedReadFile.mockResolvedValue(JSON.stringify(data));
}

function minimalValid(): Record<string, unknown> {
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

describe('parseStatusFile', () => {
  describe('current format', () => {
    it('parses current format status.json', async () => {
      mockJson(currentFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.runId).toBe('20260225-1323Z-orchestrated');
      expect(result.projectSlug).toBe('factory');
      expect(result.status).toBe('in_progress');
      expect(result.externalPlan).toBe(true);
      expect(result.phases.architecture?.status).toBe('completed');
      expect(result.phases.planning?.stepCount).toBe(7);
      expect(result.phaseDecision).toEqual({
        architecture: { run: true, reason: 'External plan exists' },
        planning: { run: true, reason: 'External plan exists with 7 steps' },
      });
    });
  });

  describe('legacy format', () => {
    it('parses legacy V1 format with review phase', async () => {
      mockJson(legacyFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.runId).toBe('20260222-2212Z-orchestrated');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-02-22T23:40:57Z');
      expect(result.phases.review?.status).toBe('approved');
      expect(result.phases.review?.iterations).toBe(2);
      expect(result.phases.review?.finalCriticality).toBe('low');
    });

    it('returns undefined for externalPlan when absent in legacy data', async () => {
      mockJson(legacyFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.externalPlan).toBeUndefined();
    });

    it('parses phaseDecision from legacy format', async () => {
      mockJson(legacyFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecision).toBeDefined();
      expect(result.phaseDecision?.architecture).toEqual({
        run: true,
        reason: 'Significant UI redesign',
      });
    });

    it('handles legacy data without externalPlan or mergeBaseSha', async () => {
      const legacyMinimal = {
        ...minimalValid(),
        status: 'completed',
        phases: { architecture: { status: 'completed' } },
      };
      mockJson(legacyMinimal);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.externalPlan).toBeUndefined();
      expect(result.mergeBaseSha).toBeUndefined();
      expect(result.diffBase).toBeUndefined();
      expect(result.maxReviewRounds).toBeUndefined();
      expect(result.fixLowFindings).toBeUndefined();
      expect(result.phaseDecision).toBeUndefined();
    });
  });

  describe('RunStatus enum validation', () => {
    it.each(['in_progress', 'completed', 'failed', 'needs_manual_review'])(
      'accepts valid status "%s"',
      async (status) => {
        mockJson({ ...minimalValid(), status });

        const result = await parseStatusFile('/path/to/status.json');

        expect(result.status).toBe(status);
      },
    );

    it.each(['pending', 'running', 'cancelled', 'COMPLETED', '', 'unknown'])(
      'rejects invalid status "%s"',
      async (status) => {
        mockJson({ ...minimalValid(), status });

        await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
          'Invalid status.json',
        );
      },
    );

    it('rejects non-string status', async () => {
      mockJson({ ...minimalValid(), status: 42 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });
  });

  describe('optional field type validation', () => {
    it('rejects non-string ticketId', async () => {
      mockJson({ ...minimalValid(), ticketId: 123 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-string completedAt', async () => {
      mockJson({ ...minimalValid(), completedAt: true });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-boolean externalPlan', async () => {
      mockJson({ ...minimalValid(), externalPlan: 'yes' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-string mergeBaseSha', async () => {
      mockJson({ ...minimalValid(), mergeBaseSha: 42 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-string diffBase', async () => {
      mockJson({ ...minimalValid(), diffBase: false });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-number maxReviewRounds', async () => {
      mockJson({ ...minimalValid(), maxReviewRounds: '3' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects non-boolean fixLowFindings', async () => {
      mockJson({ ...minimalValid(), fixLowFindings: 'true' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });
  });

  describe('phases validation', () => {
    it('rejects null phases', async () => {
      mockJson({ ...minimalValid(), phases: null });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects array phases', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ ...minimalValid(), phases: [] }),
      );

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects string phases', async () => {
      mockJson({ ...minimalValid(), phases: 'phases' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('accepts empty phases object', async () => {
      mockJson(minimalValid());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phases).toEqual({});
    });

    it('rejects phase with invalid status', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          architecture: { status: 'invalid_status' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phase with non-string status', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          architecture: { status: 42 },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phase that is not an object', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          architecture: 'completed',
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phase with invalid criticality', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          holisticReview: { status: 'completed', criticality: 'critical' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phase with invalid finalCriticality', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          review: { status: 'approved', finalCriticality: 'extreme' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('accepts phase with valid criticality values', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          holisticReview: { status: 'completed', criticality: 'low' },
          review: { status: 'approved', finalCriticality: 'none' },
        },
      });

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phases.holisticReview).toBeDefined();
      expect(result.phases.review).toBeDefined();
    });
  });

  describe('phaseDecision validation', () => {
    it('accepts undefined phaseDecision', async () => {
      mockJson(minimalValid());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecision).toBeUndefined();
    });

    it('rejects non-object phaseDecision', async () => {
      mockJson({ ...minimalValid(), phaseDecision: 'decisions' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phaseDecision entry missing run', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { reason: 'Missing run field' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phaseDecision entry missing reason', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { run: true },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phaseDecision entry with wrong types', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { run: 'yes', reason: 42 },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('rejects phaseDecision entry that is not an object', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: 'should run',
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON', async () => {
      mockedReadFile.mockResolvedValue('not json');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow();
    });

    it('throws on file read error (ENOENT)', async () => {
      const error = new Error('ENOENT: no such file or directory');
      Object.assign(error, { code: 'ENOENT' });
      mockedReadFile.mockRejectedValue(error);

      await expect(parseStatusFile('/path/to/missing.json')).rejects.toThrow('ENOENT');
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

    it('throws when input is an array', async () => {
      mockedReadFile.mockResolvedValue('[]');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('throws when input is an empty object', async () => {
      mockedReadFile.mockResolvedValue('{}');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });

    it('throws when input is null', async () => {
      mockedReadFile.mockResolvedValue('null');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        'Invalid status.json',
      );
    });
  });
});
