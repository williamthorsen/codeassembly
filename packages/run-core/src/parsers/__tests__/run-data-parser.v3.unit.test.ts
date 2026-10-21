import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it, vi } from 'vitest';

import { RunDataParseError } from '../../run-data-parse-error.ts';
import { parseRunData, parseRunRawData } from '../run-data-parser.ts';
import { captureRejection } from '../test-utils/capture-rejection.ts';
import { mockFileContents } from '../test-utils/mock-read-file.ts';
import { buildCurrentFormatFixture, buildV2Fixture } from '../test-utils/run-data-fixtures.ts';

vi.mock('node:fs/promises', () => {
  const readFile = vi.fn();
  return { default: { readFile }, readFile };
});

describe('parseRunData', () => {
  describe('v3 (header + log)', () => {
    /** Builds a v3 run-index header: the required context fields, plus a `mode` and a `model` in the config. */
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

    /** Serializes the events as JSONL, one event per line. */
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

    it('propagates reason from run_failed event in JSONL', async () => {
      const logContent = jsonlLines(
        { t: '2026-01-01T00:00:00Z', event: 'run_started' },
        { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'implementation' },
        {
          t: '2026-01-01T00:02:00Z',
          event: 'run_failed',
          status: 'failed',
          reason: 'quality gates failed',
        },
      );

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': logContent,
      });

      const result = await parseRunData('/runs/test-run');

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('quality gates failed');
    });

    it('throws descriptive error when v3 header is present but run-log.jsonl is ENOENT', async () => {
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

    it('logs corrupt JSON lines at error level', async () => {
      using silent = silenceConsole(['error']);

      const lines = [
        JSON.stringify({ t: '2026-01-01T00:00:00Z', event: 'run_started' }),
        '{ not valid json',
        JSON.stringify({ t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' }),
      ].join('\n');

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': lines,
      });

      await parseRunData('/runs/test-run');

      expect(silent.error).toHaveBeenCalledOnce();
      expect(silent.error).toHaveBeenCalledWith(
        expect.stringContaining('[run-data-parser] corrupt JSON at line index 1'),
        expect.any(SyntaxError),
      );
    });

    it('logs unrecognized event types at warn level', async () => {
      using silent = silenceConsole(['warn']);

      const logContent = jsonlLines(
        { t: '2026-01-01T00:00:00Z', event: 'run_started' },
        { t: '2026-01-01T00:01:00Z', event: 'future_event_type', data: {} },
        { t: '2026-01-01T00:02:00Z', event: 'run_completed', status: 'completed' },
      );

      mockFileContents({
        '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
        '/runs/test-run/run-log.jsonl': logContent,
      });

      await parseRunData('/runs/test-run');

      expect(silent.warn).toHaveBeenCalledOnce();
      expect(silent.warn).toHaveBeenCalledWith(
        expect.stringContaining('[run-data-parser] skipped unrecognized event at line index 1'),
        expect.anything(),
      );
    });

    it('includes file path in error for corrupt run-index.json JSON', async () => {
      mockFileContents({
        '/runs/test-run/run-index.json': '{ not valid json !!!',
      });

      await expect(parseRunData('/runs/test-run')).rejects.toThrow(
        /Failed to parse JSON at \/runs\/test-run\/run-index\.json/,
      );
    });
  });
});

describe(parseRunRawData, () => {
  /** Builds a v3 run-index header: the required context fields, plus a `mode` and a `model` in the config. */
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

  /** Serializes the events as JSONL, one event per line. */
  function jsonlLines(...events: Record<string, unknown>[]): string {
    return events.map((e) => JSON.stringify(e)).join('\n');
  }

  it('returns header and events for a v3 run', async () => {
    const logContent = jsonlLines(
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
      { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
    );

    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
      '/runs/test-run/run-log.jsonl': logContent,
    });

    const result = await parseRunRawData('/runs/test-run');

    expect(result.header.runId).toBe('v3-test-run');
    expect(result.header.mode).toBe('orchestrated');
    expect(result.events).toHaveLength(3);
    expect(result.events[0]?.event).toBe('run_started');
    expect(result.events[2]?.event).toBe('run_completed');
  });

  it('throws no_event_log for v1 runs (without a run-index.json)', async () => {
    mockFileContents({
      '/runs/test-run/status.json': JSON.stringify(buildCurrentFormatFixture()),
    });

    const error = await captureRejection(() => parseRunRawData('/runs/test-run'));

    expect(error).toBeInstanceOf(RunDataParseError);
    if (!(error instanceof RunDataParseError)) return;
    expect(error.category).toBe('no_event_log');
  });

  it('throws no_event_log for v2 runs (non-v3 schema)', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(buildV2Fixture()),
    });

    const error = await captureRejection(() => parseRunRawData('/runs/test-run'));

    expect(error).toBeInstanceOf(RunDataParseError);
    if (!(error instanceof RunDataParseError)) return;
    expect(error.category).toBe('no_event_log');
  });

  it('throws corrupt_json for unparseable JSON', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': '{ not valid json !!!',
    });

    const error = await captureRejection(() => parseRunRawData('/runs/test-run'));

    expect(error).toBeInstanceOf(RunDataParseError);
    if (!(error instanceof RunDataParseError)) return;
    expect(error.category).toBe('corrupt_json');
  });

  it('throws missing_companion when run-log.jsonl is absent for a v3 run', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
    });

    const error = await captureRejection(() => parseRunRawData('/runs/test-run'));

    expect(error).toBeInstanceOf(RunDataParseError);
    if (!(error instanceof RunDataParseError)) return;
    expect(error.category).toBe('missing_companion');
  });

  it('returns empty events array for an empty log file', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
      '/runs/test-run/run-log.jsonl': '',
    });

    const result = await parseRunRawData('/runs/test-run');

    expect(result.header.runId).toBe('v3-test-run');
    expect(result.events).toHaveLength(0);
  });
});
