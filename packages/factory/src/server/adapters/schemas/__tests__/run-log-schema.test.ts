import { describe, expect, it } from 'vitest';

import { parseRunLogLine, v3RunIndexSchema } from '../run-log-schema.js';

describe('parseRunLogLine', () => {
  it('parses a run_started event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:00:00Z', event: 'run_started' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_started');
    expect(result.t).toBe('2026-01-01T00:00:00Z');
  });

  it('parses a phase_started event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_started');
  });

  it('parses a phase_completed event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:02:00Z',
      event: 'phase_completed',
      phase: 'architecture',
      status: 'completed',
      data: { impactLevel: 'high' },
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_completed');
  });

  it('parses a reviewer_dispatched event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:03:00Z',
      event: 'reviewer_dispatched',
      reviewer: 'code-reviewer',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('reviewer_dispatched');
  });

  it('parses a run_completed event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_completed');
  });

  it('parses a run_failed event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:10:00Z',
      event: 'run_failed',
      status: 'failed',
      reason: 'coder crashed',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_failed');
  });

  it('parses a phase_decision event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:00:30Z',
      event: 'phase_decision',
      phase: 'architecture',
      run: true,
      reason: 'Complex',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_decision');
  });

  it('parses a reviewer_completed event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:05:00Z',
      event: 'reviewer_completed',
      reviewer: 'code-reviewer',
      status: 'completed',
      criticality: 'low',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('reviewer_completed');
  });

  it('parses a coder_fix_started event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:06:00Z', event: 'coder_fix_started', iteration: 1 });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('coder_fix_started');
  });

  it('parses a coder_fix_completed event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:07:00Z', event: 'coder_fix_completed', iteration: 1 });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('coder_fix_completed');
  });

  it('parses a re_review_dispatched event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:08:00Z',
      event: 're_review_dispatched',
      reviewers: ['code-reviewer', 'test-reviewer'],
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('re_review_dispatched');
  });

  it('parses a re_review_completed event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:09:00Z',
      event: 're_review_completed',
      criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'low' },
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('re_review_completed');
  });

  it('parses an artifact_written event', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:04:00Z',
      event: 'artifact_written',
      filename: 'arch.md',
      role: 'architect',
      roleType: 'analyst',
      agent: 'orchestrated-architect',
      type: 'architecture',
      phase: 'architecture',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('artifact_written');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseRunLogLine('not json!')).toThrow();
  });

  it('throws when event field is missing', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:00:00Z' });
    expect(() => parseRunLogLine(line)).toThrow();
  });

  it('parses lines with unknown fields without throwing (strips extras)', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:00:00Z',
      event: 'run_started',
      futureField: 'will-be-stripped',
    });
    // Should not throw — unknown fields are silently stripped by Zod's default behavior
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_started');
    // Extra fields are stripped (not preserved) since schemas don't use .loose()
    const resultObj: Record<string, unknown> = { ...result };
    expect(resultObj.futureField).toBeUndefined();
  });
});

describe('v3RunIndexSchema', () => {
  function minimalV3(): Record<string, unknown> {
    return {
      version: 3,
      context: {
        runId: 'test-run',
        projectSlug: 'test',
        projectRoot: '/test',
        branch: 'main',
        task: 'test task',
        startedAt: '2026-01-01T00:00:00Z',
      },
      config: {},
    };
  }

  it('accepts a valid v3 header', () => {
    const result = v3RunIndexSchema.safeParse(minimalV3());
    expect(result.success).toBe(true);
  });

  it('rejects a v2 fixture (version 2)', () => {
    const v2Fixture = {
      version: 2,
      context: {
        runId: 'test-run',
        projectSlug: 'test',
        projectRoot: '/test',
        branch: 'main',
        task: 'test task',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: null,
        status: 'in_progress',
        phases: {},
        phaseDecisions: {},
      },
      config: {},
    };
    const result = v3RunIndexSchema.safeParse(v2Fixture);
    expect(result.success).toBe(false);
  });
});
