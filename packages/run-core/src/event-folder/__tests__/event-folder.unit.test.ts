import { describe, expect, it } from 'vitest';

import type { RunEvent } from '../../types/run-log.ts';
import { foldEvents } from '../event-folder.ts';
import { createHeader } from '../test-utils/create-header.ts';

describe('foldEvents', () => {
  it('returns initial state for an empty event list', () => {
    const header = createHeader();
    const result = foldEvents(header, []);

    expect(result.runId).toBe('test-run');
    expect(result.status).toBe('in_progress');
    expect(result.waitingForInput).toBeUndefined();
    expect(result.phaseDecisions).toEqual({});
    expect(result.artifacts).toEqual([]);
    expect(result.completedAt).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it('sets waitingForInput on waiting_for_input event', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:15:00Z', event: 'waiting_for_input', reason: 'permission_prompt' }];

    const result = foldEvents(header, events);

    expect(result.waitingForInput).toBe('permission_prompt');
  });

  it('clears waitingForInput on input_received event', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:15:00Z', event: 'waiting_for_input', reason: 'elicitation_dialog' },
      { t: '2026-01-01T00:15:30Z', event: 'input_received' },
    ];

    const result = foldEvents(header, events);

    expect(result.waitingForInput).toBeUndefined();
  });

  it('accumulates phase_decision events', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:01Z', event: 'phase_decision', phase: 'architecture', run: true, reason: 'Complex' },
      { t: '2026-01-01T00:00:02Z', event: 'phase_decision', phase: 'planning', run: false, reason: 'Simple task' },
    ];

    const result = foldEvents(header, events);

    expect(result.phaseDecisions).toEqual({
      architecture: { run: true, reason: 'Complex' },
      planning: { run: false, reason: 'Simple task' },
    });
  });

  it('appends artifacts on artifact_written', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      {
        t: '2026-01-01T00:02:00Z',
        event: 'artifact_written',
        filename: 'arch.md',
        role: 'architect',
        roleType: 'analyst',
        agent: 'orchestrated-architect',
        type: 'architecture',
        phase: 'architecture',
        iteration: undefined,
        note: undefined,
      },
    ];

    const result = foldEvents(header, events);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts?.[0]).toMatchObject({
      filename: 'arch.md',
      role: 'architect',
      createdAt: '2026-01-01T00:02:00Z',
    });
  });

  it('sets iteration and note on artifact when present in artifact_written', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      {
        t: '2026-01-01T00:02:00Z',
        event: 'artifact_written',
        filename: 'fix-summary.md',
        role: 'coder',
        roleType: 'implementer',
        agent: 'orchestrated-coder',
        type: 'change-summary',
        phase: 'review',
        iteration: 2,
        note: 'revised after review',
      },
    ];

    const result = foldEvents(header, events);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts?.[0]?.iteration).toBe(2);
    expect(result.artifacts?.[0]?.note).toBe('revised after review');
  });

  it('sets status and completedAt on run_completed', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T01:00:00Z', event: 'run_completed', status: 'completed' }];

    const result = foldEvents(header, events);

    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe('2026-01-01T01:00:00Z');
  });

  it('sets status and completedAt on run_failed', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T01:00:00Z', event: 'run_failed', status: 'failed', reason: 'coder crashed' },
    ];

    const result = foldEvents(header, events);

    expect(result.status).toBe('failed');
    expect(result.completedAt).toBe('2026-01-01T01:00:00Z');
    expect(result.reason).toBe('coder crashed');
  });

  it('sets reason to undefined on run_failed without reason', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T01:00:00Z', event: 'run_failed', status: 'failed' }];

    const result = foldEvents(header, events);

    expect(result.reason).toBeUndefined();
  });

  it('fold-to-cursor produces partial state from event prefix', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:01Z', event: 'phase_started', phase: 'architecture' },
      {
        t: '2026-01-01T00:00:02Z',
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'high' },
      },
      { t: '2026-01-01T00:00:03Z', event: 'phase_started', phase: 'planning' },
      {
        t: '2026-01-01T00:00:04Z',
        event: 'phase_completed',
        phase: 'planning',
        status: 'completed',
        data: { stepCount: 5 },
      },
    ];

    const partial = foldEvents(header, events.slice(0, 2));

    expect(partial.phases.architecture).toMatchObject({ status: 'completed', impactLevel: 'high' });
    expect(partial.phases.planning).toBeUndefined();
    expect(partial.status).toBe('in_progress');
  });

  it('handles run_started as a no-op (status already in_progress)', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:00:00Z', event: 'run_started' }];

    const result = foldEvents(header, events);

    expect(result.status).toBe('in_progress');
  });

  it('produces correct CanonicalRunStatus from a full event sequence', () => {
    const header = createHeader({
      runId: 'full-run',
      projectSlug: 'my-project',
      ticketId: 'PROJ-42',
      mode: 'orchestrated',
      model: 'claude-opus-4-6',
      externalPlan: true,
      maxReviewRounds: 3,
    });

    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },

      // Phase decisions
      { t: '2026-01-01T00:00:01Z', event: 'phase_decision', phase: 'architecture', run: true, reason: 'Complex' },
      { t: '2026-01-01T00:00:02Z', event: 'phase_decision', phase: 'planning', run: true, reason: 'Multi-step' },

      // Architecture
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
      {
        t: '2026-01-01T00:01:05Z',
        event: 'artifact_written',
        filename: 'architecture.md',
        role: 'architect',
        roleType: 'analyst',
        agent: 'orchestrated-architect',
        type: 'architecture',
        phase: 'architecture',
      },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'high' },
      },

      // Planning
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'planning' },
      {
        t: '2026-01-01T00:03:05Z',
        event: 'artifact_written',
        filename: 'plan.md',
        role: 'planner',
        roleType: 'planner',
        agent: 'orchestrated-planner',
        type: 'plan',
        phase: 'planning',
      },
      {
        t: '2026-01-01T00:04:00Z',
        event: 'phase_completed',
        phase: 'planning',
        status: 'completed',
        data: { stepCount: 7, artifacts: ['plan.md', 'plan.json'] },
      },

      // Implementation
      { t: '2026-01-01T00:05:00Z', event: 'phase_started', phase: 'implementation' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 'phase_completed',
        phase: 'implementation',
        status: 'completed',
        data: { qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' } },
      },

      // Review
      { t: '2026-01-01T00:07:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:07:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      { t: '2026-01-01T00:07:02Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:07:30Z',
        event: 'reviewer_completed',
        reviewer: 'code-reviewer',
        status: 'completed',
        criticality: 'low',
      },
      {
        t: '2026-01-01T00:07:35Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'medium',
      },
      { t: '2026-01-01T00:08:00Z', event: 'coder_fix_started', iteration: 1 },
      { t: '2026-01-01T00:08:30Z', event: 'coder_fix_completed', iteration: 1 },
      {
        t: '2026-01-01T00:09:00Z',
        event: 're_review_dispatched',
        reviewers: ['code-reviewer', 'test-reviewer'],
      },
      {
        t: '2026-01-01T00:09:30Z',
        event: 're_review_completed',
        criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'none' },
      },
      {
        t: '2026-01-01T00:10:00Z',
        event: 'phase_completed',
        phase: 'review',
        status: 'completed',
        data: { aggregatedCriticality: 'none', reviewRoundsUsed: 2 },
      },

      // Simplifier
      { t: '2026-01-01T00:11:00Z', event: 'phase_started', phase: 'simplifier' },
      {
        t: '2026-01-01T00:12:00Z',
        event: 'phase_completed',
        phase: 'simplifier',
        status: 'completed',
        data: { ran: true, actionableFindings: false, coderFixCycleRan: false },
      },

      // Holistic
      { t: '2026-01-01T00:13:00Z', event: 'phase_started', phase: 'holistic' },
      {
        t: '2026-01-01T00:14:00Z',
        event: 'phase_completed',
        phase: 'holistic',
        status: 'completed',
        data: { criticality: 'none', coderFixCycleRan: false, reviewRoundsUsed: 1 },
      },

      { t: '2026-01-01T01:00:00Z', event: 'run_completed', status: 'completed' },
    ];

    const result = foldEvents(header, events);

    // Top-level fields from header
    expect(result.runId).toBe('full-run');
    expect(result.projectSlug).toBe('my-project');
    expect(result.ticketId).toBe('PROJ-42');
    expect(result.mode).toBe('orchestrated');
    expect(result.model).toBe('claude-opus-4-6');
    expect(result.externalPlan).toBe(true);
    expect(result.maxReviewRounds).toBe(3);

    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe('2026-01-01T01:00:00Z');

    expect(result.phaseDecisions).toEqual({
      architecture: { run: true, reason: 'Complex' },
      planning: { run: true, reason: 'Multi-step' },
    });

    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts?.[0]?.filename).toBe('architecture.md');
    expect(result.artifacts?.[1]?.filename).toBe('plan.md');

    expect(result.phases.architecture).toMatchObject({
      status: 'completed',
      impactLevel: 'high',
    });

    expect(result.phases.planning).toMatchObject({
      status: 'completed',
      stepCount: 7,
      artifacts: ['plan.md', 'plan.json'],
    });

    expect(result.phases.implementation).toMatchObject({
      status: 'completed',
      qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' },
    });

    expect(result.phases.parallelReview?.status).toBe('completed');
    expect(result.phases.parallelReview?.aggregatedCriticality).toBe('none');
    expect(result.phases.parallelReview?.reviewRoundsUsed).toBe(2);
    expect(result.phases.parallelReview?.coderFixCycleRan).toBe(true);
    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']).toMatchObject({
      ran: true,
      status: 'completed',
      criticality: 'low',
      reReviewCriticality: 'none',
    });
    expect(result.phases.parallelReview?.reviewers?.['test-reviewer']).toMatchObject({
      ran: true,
      status: 'completed',
      criticality: 'medium',
      reReviewCriticality: 'none',
    });
    expect(result.phases.parallelReview?.selectiveReReview).toMatchObject({
      ran: true,
      reviewersDispatched: ['code-reviewer', 'test-reviewer'],
      additionalFixCycleRan: false,
    });

    expect(result.phases.codeSimplifier).toMatchObject({
      status: 'completed',
      ran: true,
      actionableFindings: false,
      coderFixCycleRan: false,
    });

    expect(result.phases.holisticReview).toMatchObject({
      status: 'completed',
      criticality: 'none',
      coderFixCycleRan: false,
      reviewRoundsUsed: 1,
    });
  });
});
