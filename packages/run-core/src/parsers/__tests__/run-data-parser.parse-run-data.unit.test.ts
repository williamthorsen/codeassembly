import { describe, expect, it, vi } from 'vitest';

import { RunDataParseError } from '../../run-data-parse-error.ts';
import { parseRunData } from '../run-data-parser.ts';
import { captureRejection } from '../test-utils/capture-rejection.ts';
import { mockEnoent, mockFileContents } from '../test-utils/mock-read-file.ts';
import { buildCurrentFormatFixture, buildV2Fixture, minimalV2 } from '../test-utils/run-data-fixtures.ts';

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile },
  readFile: mockedReadFile,
}));

describe('parseRunData', () => {
  describe('v2 parsing', () => {
    it('parses v2 run-index.json', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(buildV2Fixture()),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('20260226-1400Z-orchestrated');
      expect(result.projectSlug).toBe('factory');
      expect(result.ticketId).toBe('CODY-3');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-02-26T15:30:00Z');
      expect(result.mode).toBe('orchestrated');
      expect(result.model).toBe('claude-opus-4-6');
      expect(result.reason).toBeUndefined();
    });

    it('flattens nested context and config to top-level fields', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(buildV2Fixture()),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.externalPlan).toBe(false);
      expect(result.mergeBaseSha).toBe('abc123');
      expect(result.diffBase).toBe('origin/main');
      expect(result.maxReviewRounds).toBe(2);
      expect(result.phases.architecture?.status).toBe('completed');
      expect(result.phaseDecisions).toEqual({
        architecture: { run: true, reason: 'New format support' },
        planning: { run: true, reason: 'Multi-step implementation' },
      });
    });

    it('passes through artifacts array', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(buildV2Fixture()),
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
        '/runs/test-run/status.json': JSON.stringify(buildCurrentFormatFixture()),
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.runId).toBe('20260225-1323Z-orchestrated');
      expect(result.projectSlug).toBe('factory');
    });

    it('normalizes v1 phaseDecision to phaseDecisions', async () => {
      mockFileContents({
        '/runs/test-run/status.json': JSON.stringify(buildCurrentFormatFixture()),
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
        '/runs/test-run/run-index.json': JSON.stringify(buildV2Fixture()),
        '/runs/test-run/status.json': JSON.stringify(buildCurrentFormatFixture()),
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

      expect(result.phaseDecisions?.['architecture']?.reason).toBe('Validate assumptions');
      expect(result.phaseDecisions?.['implementation']?.reason).toBeUndefined();
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
        '/runs/test-run/status.json': JSON.stringify(buildCurrentFormatFixture()),
      });
      mockedReadFile.mockClear();

      await expect(parseRunData('/runs/test-run')).rejects.toThrow();
      expect(mockedReadFile).toHaveBeenCalledTimes(1);
      expect(mockedReadFile).toHaveBeenCalledWith('/runs/test-run/run-index.json', 'utf8');
    });
  });

  describe('RunDataParseError metadata', () => {
    it('throws RunDataParseError with corrupt_json for invalid run-index.json JSON', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': '{ not valid json !!!',
      });

      const error = await captureRejection(() => parseRunData('/runs/test-run'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('corrupt_json');
      expect(error.filePath).toBe('/runs/test-run/run-index.json');
    });

    it('throws RunDataParseError with invalid_schema for invalid v2 run-index.json', async () => {
      const invalid = { ...minimalV2(), version: 1 };
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(invalid),
      });

      const error = await captureRejection(() => parseRunData('/runs/test-run'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('invalid_schema');
      expect(error.filePath).toBe('/runs/test-run/run-index.json');
      expect(error.zodIssues).toBeDefined();
      expect(error.zodIssues?.length).toBeGreaterThan(0);
    });

    it('throws RunDataParseError with missing_companion when v3 run-log.jsonl is absent', async () => {
      const v3Header = {
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
      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(v3Header),
      });

      const error = await captureRejection(() => parseRunData('/runs/test-run'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('missing_companion');
      expect(error.filePath).toBe('/runs/test-run/run-index.json');
    });

    it('throws RunDataParseError with corrupt_json for invalid status.json JSON (v1 fallback)', async () => {
      mockFileContents({
        '/runs/test-run/status.json': 'not json at all',
      });

      const error = await captureRejection(() => parseRunData('/runs/test-run'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('corrupt_json');
      expect(error.filePath).toBe('/runs/test-run/status.json');
    });

    it('throws RunDataParseError with invalid_schema for invalid status.json schema (v1 fallback)', async () => {
      mockFileContents({
        '/runs/test-run/status.json': JSON.stringify({ runId: 'only-one-field' }),
      });

      const error = await captureRejection(() => parseRunData('/runs/test-run'));

      expect(error).toBeInstanceOf(RunDataParseError);
      if (!(error instanceof RunDataParseError)) return;
      expect(error.category).toBe('invalid_schema');
      expect(error.filePath).toBe('/runs/test-run/status.json');
      expect(error.zodIssues).toBeDefined();
    });
  });
});
