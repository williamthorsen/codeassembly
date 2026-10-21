import { describe, expect, it, vi } from 'vitest';

import { RunDataParseError } from '../../run-data-parse-error.ts';
import { parseStatusFile } from '../run-data-parser.ts';
import { captureRejection } from '../test-utils/capture-rejection.ts';
import { mockEnoent, mockJson } from '../test-utils/mock-read-file.ts';
import { buildCurrentFormatFixture, buildLegacyFormatFixture, minimalValid } from '../test-utils/run-data-fixtures.ts';

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile },
  readFile: mockedReadFile,
}));

describe('parseStatusFile', () => {
  describe('current format', () => {
    it('parses current format status.json', async () => {
      mockJson(buildCurrentFormatFixture());

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
      mockJson(buildCurrentFormatFixture());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.mode).toBeUndefined();
      expect(result.model).toBeUndefined();
      expect(result.reason).toBeUndefined();
      expect(result.artifacts).toBeUndefined();
    });
  });

  describe('legacy format', () => {
    it('parses legacy V1 format with review phase', async () => {
      mockJson(buildLegacyFormatFixture());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.runId).toBe('20260222-2212Z-orchestrated');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-02-22T23:40:57Z');
      expect(result.phases.review?.status).toBe('approved');
      expect(result.phases.review?.iterations).toBe(2);
      expect(result.phases.review?.finalCriticality).toBe('low');
    });

    it('returns undefined for externalPlan when absent in legacy data', async () => {
      mockJson(buildLegacyFormatFixture());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.externalPlan).toBeUndefined();
    });

    it('parses phaseDecision from legacy format as phaseDecisions', async () => {
      mockJson(buildLegacyFormatFixture());

      const result = await parseStatusFile('/path/to/status.json');

      expect(result.phaseDecisions).toBeDefined();
      expect(result.phaseDecisions?.['architecture']).toEqual({
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

      expect(result.phaseDecisions?.['architecture']).toEqual({ run: true });
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
        startedAt: '2026-01-01T09:42:11Z',
        status: 'completed',
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

  describe('RunDataParseError metadata', () => {
    it('throws RunDataParseError with corrupt_json category for invalid JSON', async () => {
      mockedReadFile.mockResolvedValue('not json');

      const error = await captureRejection(() => parseStatusFile('/path/to/status.json'));

      expect(error).toBeInstanceOf(RunDataParseError);
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('corrupt_json');
      expect(error.filePath).toBe('/path/to/status.json');
      expect(error.zodIssues).toBeUndefined();
    });

    it('throws RunDataParseError with invalid_schema category and zodIssues for schema failures', async () => {
      mockedReadFile.mockResolvedValue('{}');

      const error = await captureRejection(() => parseStatusFile('/path/to/status.json'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('invalid_schema');
      expect(error.filePath).toBe('/path/to/status.json');
      expect(error.zodIssues).toBeDefined();
      expect(error.zodIssues?.length).toBeGreaterThan(0);
    });
  });
});
