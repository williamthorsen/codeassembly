import { describe, expect, it } from 'vitest';

import type { RunEvent } from '../../types/run-log.ts';
import { foldEvents } from '../event-folder.ts';
import { createHeader } from '../test-utils/create-header.ts';

describe('foldEvents', () => {
  it('sets phase to in_progress on phase_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' }];

    const result = foldEvents(header, events);

    expect(result.phases.architecture).toMatchObject({ status: 'in_progress' });
  });

  it('merges data on phase_completed for architecture', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'medium' },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.architecture).toMatchObject({
      status: 'completed',
      impactLevel: 'medium',
    });
  });

  it('creates a full parallelReview stub on review phase_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' }];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview).toMatchObject({
      status: 'in_progress',
      aggregatedCriticality: undefined,
      reviewRoundsUsed: 0,
      reviewers: {},
      coderFixCycleRan: false,
      selectiveReReview: undefined,
    });
  });

  it('handles codeSimplifier phase via simplifier event phase name', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:10:00Z', event: 'phase_started', phase: 'simplifier' },
      {
        t: '2026-01-01T00:11:00Z',
        event: 'phase_completed',
        phase: 'simplifier',
        status: 'completed',
        data: { ran: true, actionableFindings: false, coderFixCycleRan: false },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.codeSimplifier).toMatchObject({
      status: 'completed',
      ran: true,
      actionableFindings: false,
    });
  });

  it('handles holisticReview phase via holistic event phase name', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:12:00Z', event: 'phase_started', phase: 'holistic' },
      {
        t: '2026-01-01T00:13:00Z',
        event: 'phase_completed',
        phase: 'holistic',
        status: 'completed',
        data: { criticality: 'none', coderFixCycleRan: false, reviewRoundsUsed: 1 },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.holisticReview).toMatchObject({
      status: 'completed',
      criticality: 'none',
    });
  });

  it('sets startedAt on phase_started for architecture', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' }];

    const result = foldEvents(header, events);

    expect(result.phases.architecture?.startedAt).toBe('2026-01-01T00:01:00Z');
  });

  it('sets completedAt on phase_completed for architecture', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'high' },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.architecture?.startedAt).toBe('2026-01-01T00:01:00Z');
    expect(result.phases.architecture?.completedAt).toBe('2026-01-01T00:02:00Z');
  });

  it('sets startedAt/completedAt on all phase types', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'planning' },
      { t: '2026-01-01T00:02:00Z', event: 'phase_completed', phase: 'planning', status: 'completed' },
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'implementation' },
      { t: '2026-01-01T00:04:00Z', event: 'phase_completed', phase: 'implementation', status: 'completed' },
      { t: '2026-01-01T00:05:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:06:00Z', event: 'phase_completed', phase: 'review', status: 'completed' },
      { t: '2026-01-01T00:07:00Z', event: 'phase_started', phase: 'simplifier' },
      { t: '2026-01-01T00:08:00Z', event: 'phase_completed', phase: 'simplifier', status: 'completed' },
      { t: '2026-01-01T00:09:00Z', event: 'phase_started', phase: 'holistic' },
      { t: '2026-01-01T00:10:00Z', event: 'phase_completed', phase: 'holistic', status: 'completed' },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.planning?.startedAt).toBe('2026-01-01T00:01:00Z');
    expect(result.phases.planning?.completedAt).toBe('2026-01-01T00:02:00Z');
    expect(result.phases.implementation?.startedAt).toBe('2026-01-01T00:03:00Z');
    expect(result.phases.implementation?.completedAt).toBe('2026-01-01T00:04:00Z');
    expect(result.phases.parallelReview?.startedAt).toBe('2026-01-01T00:05:00Z');
    expect(result.phases.parallelReview?.completedAt).toBe('2026-01-01T00:06:00Z');
    expect(result.phases.codeSimplifier?.startedAt).toBe('2026-01-01T00:07:00Z');
    expect(result.phases.codeSimplifier?.completedAt).toBe('2026-01-01T00:08:00Z');
    expect(result.phases.holisticReview?.startedAt).toBe('2026-01-01T00:09:00Z');
    expect(result.phases.holisticReview?.completedAt).toBe('2026-01-01T00:10:00Z');
  });

  it('sets implementation to in_progress on phase_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:05:00Z', event: 'phase_started', phase: 'implementation' }];

    const result = foldEvents(header, events);

    expect(result.phases.implementation).toMatchObject({
      status: 'in_progress',
      artifact: undefined,
      qualityGates: undefined,
    });
  });

  it('merges implementation phase_completed with qualityGates as string', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:05:00Z', event: 'phase_started', phase: 'implementation' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 'phase_completed',
        phase: 'implementation',
        status: 'completed',
        data: { qualityGates: 'all passing (typecheck, lint, tests)' },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.implementation).toMatchObject({
      status: 'completed',
      qualityGates: 'all passing (typecheck, lint, tests)',
    });
  });

  it('merges implementation phase_completed with qualityGates as object', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:05:00Z', event: 'phase_started', phase: 'implementation' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 'phase_completed',
        phase: 'implementation',
        status: 'completed',
        data: { qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' } },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.implementation).toMatchObject({
      status: 'completed',
      qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' },
    });
  });

  it('sets planning to in_progress on phase_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:02:00Z', event: 'phase_started', phase: 'planning' }];

    const result = foldEvents(header, events);

    expect(result.phases.planning).toMatchObject({
      status: 'in_progress',
      stepCount: undefined,
      artifacts: undefined,
    });
  });

  it('merges planning phase_completed with artifacts array', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:02:00Z', event: 'phase_started', phase: 'planning' },
      {
        t: '2026-01-01T00:03:00Z',
        event: 'phase_completed',
        phase: 'planning',
        status: 'completed',
        data: { stepCount: 5, artifacts: ['plan.md', 'plan.json'] },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.planning).toMatchObject({
      status: 'completed',
      stepCount: 5,
      artifacts: ['plan.md', 'plan.json'],
    });
  });

  it('merges aggregatedCriticality and reviewRoundsUsed on review phase_completed', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      {
        t: '2026-01-01T00:04:00Z',
        event: 'phase_completed',
        phase: 'review',
        status: 'completed',
        data: { aggregatedCriticality: 'medium', reviewRoundsUsed: 2 },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.status).toBe('completed');
    expect(result.phases.parallelReview?.aggregatedCriticality).toBe('medium');
    expect(result.phases.parallelReview?.reviewRoundsUsed).toBe(2);
  });

  it('folds usage metrics from phase_completed into phase object', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'implementation' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 'phase_completed',
        phase: 'implementation',
        status: 'completed',
        data: { qualityGates: 'passed' },
        tokens: 150_000,
        toolUses: 40,
        durationMs: 300_000,
      },
    ];
    const state = foldEvents(header, events);
    expect(state.phases.implementation?.usage).toEqual({
      tokens: 150_000,
      toolUses: 40,
      durationMs: 300_000,
    });
  });
});
