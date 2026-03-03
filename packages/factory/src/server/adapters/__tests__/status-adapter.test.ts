import { describe, expect, it, vi } from 'vitest';

import { silencedConsole } from '../../../test-utils.js';
import { parseRunData, parseStatusFile } from '../status-adapter.js';

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
  task: 'Build the CodeAssembly Factory foundation',
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

const v2Fixture = {
  version: 2,
  context: {
    runId: '20260226-1400Z-orchestrated',
    projectSlug: 'factory',
    ticketId: 'CODY-3',
    projectRoot: '/Users/william/repos/projects/factory',
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
    fixLowFindings: false,
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

function mockJson(data: Record<string, unknown>): void {
  mockedReadFile.mockResolvedValue(JSON.stringify(data));
}

function mockFileContents(pathContentMap: Record<string, string>): void {
  mockedReadFile.mockImplementation((path: string) => {
    const content = pathContentMap[path];
    if (content !== undefined) {
      return Promise.resolve(content);
    }
    const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
    Object.assign(error, { code: 'ENOENT' });
    return Promise.reject(error);
  });
}

function mockEnoent(): void {
  const error = new Error('ENOENT: no such file or directory');
  Object.assign(error, { code: 'ENOENT' });
  mockedReadFile.mockRejectedValue(error);
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

interface MinimalV2 {
  version: number;
  context: Record<string, unknown>;
  config: Record<string, unknown>;
  artifacts?: unknown[];
}

function minimalV2(): MinimalV2 {
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
      expect(result.phaseDecisions).toEqual({
        architecture: { run: true, reason: 'External plan exists' },
        planning: { run: true, reason: 'External plan exists with 7 steps' },
      });
    });

    it('normalizes v1 fields to canonical shape', async () => {
      mockJson(currentFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.mode).toBeUndefined();
      expect(result.model).toBeUndefined();
      expect(result.artifacts).toBeUndefined();
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

    it('parses phaseDecision from legacy format as phaseDecisions', async () => {
      mockJson(legacyFormatFixture);

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecisions).toBeDefined();
      expect(result.phaseDecisions?.architecture).toEqual({
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
      expect(result.phaseDecisions).toBeUndefined();
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

        await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
      },
    );

    it('rejects non-string status', async () => {
      mockJson({ ...minimalValid(), status: 42 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });
  });

  describe('optional field type validation', () => {
    it('rejects non-string ticketId', async () => {
      mockJson({ ...minimalValid(), ticketId: 123 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects non-string completedAt', async () => {
      mockJson({ ...minimalValid(), completedAt: true });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('converts completedAt: null to undefined', async () => {
      mockJson({ ...minimalValid(), completedAt: null });

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.completedAt).toBeUndefined();
    });

    it('rejects non-boolean externalPlan', async () => {
      mockJson({ ...minimalValid(), externalPlan: 'yes' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects non-string mergeBaseSha', async () => {
      mockJson({ ...minimalValid(), mergeBaseSha: 42 });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects non-string diffBase', async () => {
      mockJson({ ...minimalValid(), diffBase: false });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects non-number maxReviewRounds', async () => {
      mockJson({ ...minimalValid(), maxReviewRounds: '3' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects non-boolean fixLowFindings', async () => {
      mockJson({ ...minimalValid(), fixLowFindings: 'true' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });
  });

  describe('phases validation', () => {
    it('rejects null phases', async () => {
      mockJson({ ...minimalValid(), phases: null });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects array phases', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ ...minimalValid(), phases: [] }));

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects string phases', async () => {
      mockJson({ ...minimalValid(), phases: 'phases' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
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

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects phase with non-string status', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          architecture: { status: 42 },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('accepts null phase entry (phase not yet reached)', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ ...minimalValid(), phases: { architecture: null } }));

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phases).toEqual({ architecture: null });
    });

    it('rejects phase that is not an object', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          architecture: 'completed',
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('accepts phase with null criticality (skipped review)', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          holisticReview: { status: 'skipped', criticality: null },
        },
      });

      const result = await parseStatusFile('/path/to/status.json');
      expect(result.phases.holisticReview).toEqual({ status: 'skipped', criticality: null });
    });

    it('rejects phase with invalid criticality', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          holisticReview: { status: 'completed', criticality: 'critical' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects phase with invalid finalCriticality', async () => {
      mockJson({
        ...minimalValid(),
        phases: {
          review: { status: 'approved', finalCriticality: 'extreme' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
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

  describe('phaseDecisions validation', () => {
    it('accepts undefined phaseDecision', async () => {
      mockJson(minimalValid());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecisions).toBeUndefined();
    });

    it('rejects non-object phaseDecision', async () => {
      mockJson({ ...minimalValid(), phaseDecision: 'decisions' });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects phaseDecision entry missing run', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { reason: 'Missing run field' },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('accepts phaseDecision entry without reason', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { run: true },
          implementation: { run: true },
        },
      });

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecisions?.architecture).toEqual({ run: true });
    });

    it('rejects phaseDecision entry with wrong types', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: { run: 'yes', reason: 42 },
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('rejects phaseDecision entry that is not an object', async () => {
      mockJson({
        ...minimalValid(),
        phaseDecision: {
          architecture: 'should run',
        },
      });

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON with file path context', async () => {
      mockedReadFile.mockResolvedValue('not json');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow(
        /Failed to parse JSON at \/path\/to\/status\.json/,
      );
    });

    it('throws on file read error (ENOENT)', async () => {
      mockEnoent();

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

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('throws when input is an empty object', async () => {
      mockedReadFile.mockResolvedValue('{}');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });

    it('throws when input is null', async () => {
      mockedReadFile.mockResolvedValue('null');

      await expect(parseStatusFile('/path/to/status.json')).rejects.toThrow('Invalid status.json');
    });
  });
});

describe('parseRunData', () => {
  describe('v2 parsing', () => {
    it('parses v2 run-index.json', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(v2Fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('20260226-1400Z-orchestrated');
      expect(result.projectSlug).toBe('factory');
      expect(result.ticketId).toBe('CODY-3');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-02-26T15:30:00Z');
      expect(result.mode).toBe('orchestrated');
      expect(result.model).toBe('claude-opus-4-6');
    });

    it('flattens nested context and config to top-level fields', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(v2Fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.externalPlan).toBe(false);
      expect(result.mergeBaseSha).toBe('abc123');
      expect(result.diffBase).toBe('origin/main');
      expect(result.maxReviewRounds).toBe(2);
      expect(result.fixLowFindings).toBe(false);
      expect(result.phases.architecture?.status).toBe('completed');
      expect(result.phaseDecisions).toEqual({
        architecture: { run: true, reason: 'New format support' },
        planning: { run: true, reason: 'Multi-step implementation' },
      });
    });

    it('passes through artifacts array', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(v2Fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts?.[0]?.filename).toBe('architecture.md');
      expect(result.artifacts?.[1]?.iteration).toBe(1);
      expect(result.artifacts?.[1]?.note).toBe('Initial plan');
    });

    it('converts completedAt: null to undefined', async () => {
      const fixture = {
        ...minimalV2(),
        context: {
          ...minimalV2().context,
          completedAt: null,
        },
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.completedAt).toBeUndefined();
    });

    it('preserves valid string completedAt value', async () => {
      const fixture = {
        ...minimalV2(),
        context: {
          ...minimalV2().context,
          completedAt: '2026-02-26T15:30:00Z',
        },
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.completedAt).toBe('2026-02-26T15:30:00Z');
    });
  });

  describe('v1 fallback', () => {
    it('falls back to status.json when run-index.json is missing', async () => {
      mockFileContents({
        '/runs/test-run/status.json': JSON.stringify(currentFormatFixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('20260225-1323Z-orchestrated');
      expect(result.projectSlug).toBe('factory');
    });

    it('normalizes v1 phaseDecision to phaseDecisions', async () => {
      mockFileContents({
        '/runs/test-run/status.json': JSON.stringify(currentFormatFixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.phaseDecisions).toEqual({
        architecture: { run: true, reason: 'External plan exists' },
        planning: { run: true, reason: 'External plan exists with 7 steps' },
      });
    });
  });

  describe('v2 precedence', () => {
    it('uses v2 when both files exist', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(v2Fixture),
        '/runs/test-run/status.json': JSON.stringify(currentFormatFixture),
      });

      const result = await parseRunData('/runs/test-run');

      // v2 fixture has different runId than v1 fixture
      expect(result.runId).toBe('20260226-1400Z-orchestrated');
      expect(result.mode).toBe('orchestrated');
      expect(result.model).toBe('claude-opus-4-6');
    });
  });

  describe('v2 validation errors', () => {
    it('accepts v2 phaseDecisions with missing reason', async () => {
      const fixture = {
        ...minimalV2(),
        context: {
          ...minimalV2().context,
          phaseDecisions: {
            architecture: { run: true, reason: 'Validate assumptions' },
            implementation: { run: true },
            'review-cycle': { run: true },
          },
        },
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.phaseDecisions?.architecture?.reason).toBe('Validate assumptions');
      expect(result.phaseDecisions?.implementation?.reason).toBeUndefined();
      expect(result.phaseDecisions?.['review-cycle']?.reason).toBeUndefined();
    });

    it('throws on invalid v2 version number', async () => {
      const invalid = { ...minimalV2(), version: 1 };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws on missing context', async () => {
      const invalid = { version: 2, config: {} };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws on missing config', async () => {
      const invalid = {
        version: 2,
        context: minimalV2().context,
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws when context is missing required fields', async () => {
      const invalid = {
        version: 2,
        context: { runId: 'test' },
        config: {},
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws when context has invalid status', async () => {
      const invalid = {
        ...minimalV2(),
        context: {
          ...minimalV2().context,
          status: 'invalid_status',
        },
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws when config has invalid field types', async () => {
      const invalid = {
        ...minimalV2(),
        config: { externalPlan: 'yes' },
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws when artifacts array contains invalid entry', async () => {
      const invalid = {
        ...minimalV2(),
        artifacts: [{ filename: 'test.md' }],
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('throws when artifacts is not an array', async () => {
      const invalid = {
        ...minimalV2(),
        artifacts: 'not-an-array',
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });

    it('accepts v2 without artifacts field', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV2()),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.artifacts).toBeUndefined();
    });

    it('accepts v2 with empty artifacts array', async () => {
      const fixture = {
        ...minimalV2(),
        artifacts: [],
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(fixture),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.artifacts).toEqual([]);
    });

    it('throws when artifact entry has invalid iteration type', async () => {
      const invalid = {
        ...minimalV2(),
        artifacts: [
          {
            filename: 'test.md',
            role: 'test',
            roleType: 'test',
            agent: 'test',
            type: 'markdown',
            phase: 'test',
            createdAt: '2026-01-01T00:00:00Z',
            iteration: 'one',
          },
        ],
      };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('Invalid run-index.json');
    });
  });

  describe('error handling', () => {
    it('throws ENOENT when neither file exists', async () => {
      mockEnoent();

      await expect(parseRunData('/runs/test-run')).rejects.toThrow('ENOENT');
    });

    it('throws on corrupt run-index.json without falling back to status.json', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': '{ invalid json !!!',
        '/runs/test-run/status.json': JSON.stringify(currentFormatFixture),
      });
      mockedReadFile.mockClear();

      await expect(parseRunData('/runs/test-run')).rejects.toThrow(
        /Failed to parse JSON at \/runs\/test-run\/run-index\.json/,
      );
      expect(mockedReadFile).toHaveBeenCalledTimes(1);
      expect(mockedReadFile).toHaveBeenCalledWith('/runs/test-run/run-index.json', 'utf8');
    });
  });

  describe('v3 (header + log)', () => {
    function minimalV3Header(): Record<string, unknown> {
      return {
        version: 3,
        context: {
          runId: 'v3-test-run',
          projectSlug: 'test',
          projectRoot: '/test',
          branch: 'main',
          task: 'test task',
          startedAt: '2026-01-01T00:00:00Z',
        },
        config: {
          mode: 'orchestrated',
          model: 'claude-opus-4-6',
        },
      };
    }

    function jsonlLines(...events: Record<string, unknown>[]): string {
      return events.map((e) => JSON.stringify(e)).join('\n');
    }

    it('parses v3 header + JSONL into CanonicalRunStatus', async () => {
      const logContent = jsonlLines(
        { t: '2026-01-01T00:00:00Z', event: 'run_started' },
        { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
        {
          t: '2026-01-01T00:02:00Z',
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          data: { impactLevel: 'high' },
        },
        { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
      );

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': logContent,
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('v3-test-run');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-01-01T00:10:00Z');
      expect(result.phases.architecture).toMatchObject({ status: 'completed', impactLevel: 'high' });
      expect(result.mode).toBe('orchestrated');
      expect(result.model).toBe('claude-opus-4-6');
    });

    it('throws when v3 header is present but run-log.jsonl is ENOENT', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow(
        'v3 run-index.json found at /runs/test-run/run-index.json but run-log.jsonl is missing',
      );
    });

    it('handles empty log file (returns initial state)', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': '',
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('v3-test-run');
      expect(result.status).toBe('in_progress');
      expect(result.phaseDecisions).toEqual({});
      expect(result.artifacts).toEqual([]);
    });

    it('skips unrecognized event types (forward compatibility)', async () => {
      using _silent = silencedConsole();
      const logContent = jsonlLines(
        { t: '2026-01-01T00:00:00Z', event: 'run_started' },
        { t: '2026-01-01T00:01:00Z', event: 'future_event_type', data: {} },
        { t: '2026-01-01T00:02:00Z', event: 'run_completed', status: 'completed' },
      );

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': logContent,
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.status).toBe('completed');
    });

    it('skips corrupt JSON line mid-stream and processes surrounding events', async () => {
      using _silent = silencedConsole();
      const lines = [
        JSON.stringify({ t: '2026-01-01T00:00:00Z', event: 'run_started' }),
        '{ not valid json',
        JSON.stringify({ t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' }),
        JSON.stringify({
          t: '2026-01-01T00:02:00Z',
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          data: { impactLevel: 'high' },
        }),
        JSON.stringify({ t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' }),
      ].join('\n');

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': lines,
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-01-01T00:10:00Z');
      expect(result.phases.architecture).toMatchObject({ status: 'completed', impactLevel: 'high' });
    });
  });
});
