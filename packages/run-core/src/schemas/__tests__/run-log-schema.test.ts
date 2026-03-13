import { describe, expect, it } from 'vitest';

import { parseRunLogLine, v3RunIndexSchema } from '../run-log-schema.js';

describe('parseRunLogLine', () => {
  it('parses a run_started event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:00:00Z', event: 'run_started' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_started');
    expect(result.t).toBe('2026-01-01T00:00:00Z');
  });

  it('parses a phase_started event with phase field', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_started');
    expect(result).toMatchObject({ phase: 'architecture' });
  });

  it('parses a phase_completed event with phase, status, and data', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:02:00Z',
      event: 'phase_completed',
      phase: 'architecture',
      status: 'completed',
      data: { impactLevel: 'high' },
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_completed');
    expect(result).toMatchObject({ phase: 'architecture', status: 'completed' });
  });

  it('parses a reviewer_dispatched event with reviewer field', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:03:00Z',
      event: 'reviewer_dispatched',
      reviewer: 'code-reviewer',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('reviewer_dispatched');
    expect(result).toMatchObject({ reviewer: 'code-reviewer' });
  });

  it('parses a run_completed event with status field', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_completed');
    expect(result).toMatchObject({ status: 'completed' });
  });

  it('parses a run_failed event with status and reason', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:10:00Z',
      event: 'run_failed',
      status: 'failed',
      reason: 'coder crashed',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('run_failed');
    expect(result).toMatchObject({ status: 'failed', reason: 'coder crashed' });
  });

  it('parses a phase_decision event with run and reason', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:00:30Z',
      event: 'phase_decision',
      phase: 'architecture',
      run: true,
      reason: 'Complex',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('phase_decision');
    expect(result).toMatchObject({ phase: 'architecture', run: true, reason: 'Complex' });
  });

  it('parses a reviewer_completed event with status and criticality', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:05:00Z',
      event: 'reviewer_completed',
      reviewer: 'code-reviewer',
      status: 'completed',
      criticality: 'low',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('reviewer_completed');
    expect(result).toMatchObject({ reviewer: 'code-reviewer', status: 'completed', criticality: 'low' });
  });

  it('parses a coder_fix_started event with iteration', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:06:00Z', event: 'coder_fix_started', iteration: 1 });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('coder_fix_started');
    expect(result).toMatchObject({ iteration: 1 });
  });

  it('parses a coder_fix_completed event with iteration', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:07:00Z', event: 'coder_fix_completed', iteration: 1 });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('coder_fix_completed');
    expect(result).toMatchObject({ iteration: 1 });
  });

  it('parses a re_review_dispatched event with reviewers', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:08:00Z',
      event: 're_review_dispatched',
      reviewers: ['code-reviewer', 'test-reviewer'],
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('re_review_dispatched');
    expect(result).toMatchObject({ reviewers: ['code-reviewer', 'test-reviewer'] });
  });

  it('parses a re_review_completed event with criticalities', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:09:00Z',
      event: 're_review_completed',
      criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'low' },
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('re_review_completed');
    expect(result).toMatchObject({ criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'low' } });
  });

  it('parses an artifact_written event with all payload fields', () => {
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
    expect(result).toMatchObject({
      filename: 'arch.md',
      role: 'architect',
      roleType: 'analyst',
      agent: 'orchestrated-architect',
      type: 'architecture',
      phase: 'architecture',
    });
  });

  it('parses reviewer_completed with optional usage metrics', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:05:00Z',
      event: 'reviewer_completed',
      reviewer: 'code-reviewer',
      status: 'completed',
      criticality: 'low',
      tokens: 45_000,
      toolUses: 12,
      durationMs: 30_000,
    });
    const result = parseRunLogLine(line);
    expect(result).toMatchObject({
      event: 'reviewer_completed',
      tokens: 45_000,
      toolUses: 12,
      durationMs: 30_000,
    });
  });

  it('parses reviewer_completed without usage metrics (backward compatible)', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:05:00Z',
      event: 'reviewer_completed',
      reviewer: 'code-reviewer',
      status: 'completed',
      criticality: 'low',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('reviewer_completed');
    expect(result).not.toHaveProperty('tokens');
    expect(result).not.toHaveProperty('toolUses');
    expect(result).not.toHaveProperty('durationMs');
  });

  it('parses coder_fix_completed with optional usage metrics', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:07:00Z',
      event: 'coder_fix_completed',
      iteration: 1,
      tokens: 80_000,
      toolUses: 25,
      durationMs: 120_000,
    });
    const result = parseRunLogLine(line);
    expect(result).toMatchObject({
      event: 'coder_fix_completed',
      tokens: 80_000,
      toolUses: 25,
      durationMs: 120_000,
    });
  });

  it('parses re_review_completed with optional usage metrics', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:09:00Z',
      event: 're_review_completed',
      criticalities: { 'code-reviewer': 'none' },
      tokens: 29_000,
      toolUses: 8,
      durationMs: 25_000,
    });
    const result = parseRunLogLine(line);
    expect(result).toMatchObject({
      event: 're_review_completed',
      tokens: 29_000,
      toolUses: 8,
      durationMs: 25_000,
    });
  });

  it('parses phase_completed with optional usage metrics', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:02:00Z',
      event: 'phase_completed',
      phase: 'implementation',
      status: 'completed',
      data: { qualityGates: 'passed' },
      tokens: 150_000,
      toolUses: 40,
      durationMs: 300_000,
    });
    const result = parseRunLogLine(line);
    expect(result).toMatchObject({
      event: 'phase_completed',
      tokens: 150_000,
      toolUses: 40,
      durationMs: 300_000,
    });
  });

  it('parses a waiting_for_input event with reason', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:15:00Z',
      event: 'waiting_for_input',
      reason: 'permission_prompt',
    });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('waiting_for_input');
    expect(result).toMatchObject({ reason: 'permission_prompt' });
  });

  it('parses an input_received event', () => {
    const line = JSON.stringify({ t: '2026-01-01T00:15:30Z', event: 'input_received' });
    const result = parseRunLogLine(line);
    expect(result.event).toBe('input_received');
    expect(result.t).toBe('2026-01-01T00:15:30Z');
  });

  it('throws when waiting_for_input has invalid reason', () => {
    const line = JSON.stringify({
      t: '2026-01-01T00:15:00Z',
      event: 'waiting_for_input',
      reason: 'invalid_reason',
    });
    expect(() => parseRunLogLine(line)).toThrow();
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

  it('rejects version 4 (strict literal check)', () => {
    const v4 = { ...minimalV3(), version: 4 };
    const result = v3RunIndexSchema.safeParse(v4);
    expect(result.success).toBe(false);
  });

  it('rejects when required context field runId is missing', () => {
    const context = {
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
    };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('rejects when required context field projectSlug is missing', () => {
    const context = {
      runId: 'test-run',
      projectRoot: '/test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
    };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('rejects when required context field projectRoot is missing', () => {
    const context = {
      runId: 'test-run',
      projectSlug: 'test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
    };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('rejects when required context field branch is missing', () => {
    const context = {
      runId: 'test-run',
      projectSlug: 'test',
      projectRoot: '/test',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
    };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('rejects when required context field task is missing', () => {
    const context = {
      runId: 'test-run',
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      startedAt: '2026-01-01T00:00:00Z',
    };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('rejects when required context field startedAt is missing', () => {
    const context = { runId: 'test-run', projectSlug: 'test', projectRoot: '/test', branch: 'main', task: 'test task' };
    const result = v3RunIndexSchema.safeParse({ version: 3, context, config: {} });
    expect(result.success).toBe(false);
  });

  it('accepts optional ticketId in context', () => {
    const result = v3RunIndexSchema.safeParse({
      version: 3,
      context: {
        runId: 'test-run',
        projectSlug: 'test',
        projectRoot: '/test',
        branch: 'main',
        task: 'test task',
        startedAt: '2026-01-01T00:00:00Z',
        ticketId: 'PROJ-42',
      },
      config: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context.ticketId).toBe('PROJ-42');
    }
  });

  it('accepts effort, approvalThreshold, and budgetThreshold in v3 config', () => {
    const fixture = {
      ...minimalV3(),
      config: {
        effort: 'high',
        approvalThreshold: 'low',
        budgetThreshold: 'low',
      },
    };
    const result = v3RunIndexSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.effort).toBe('high');
      expect(result.data.config.approvalThreshold).toBe('low');
      expect(result.data.config.budgetThreshold).toBe('low');
    }
  });

  it('accepts optional config fields (mode, model, externalPlan)', () => {
    const fixture = {
      ...minimalV3(),
      config: {
        mode: 'orchestrated',
        model: 'claude-opus-4-6',
        externalPlan: true,
        mergeBaseSha: 'abc123',
        diffBase: 'origin/main',
        maxReviewRounds: 3,
      },
    };
    const result = v3RunIndexSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.mode).toBe('orchestrated');
      expect(result.data.config.model).toBe('claude-opus-4-6');
      expect(result.data.config.externalPlan).toBe(true);
    }
  });
});
