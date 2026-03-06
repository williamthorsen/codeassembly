import { describe, expect, it } from 'vitest';

import { foldEvents } from '../event-folder.js';
import type { RunEvent, RunHeader } from '../types/run-log.js';

function createHeader(overrides: Partial<RunHeader> = {}): RunHeader {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
    ...overrides,
  };
}

describe('foldEvents', () => {
  it('returns initial state with no events', () => {
    const header = createHeader();
    const result = foldEvents(header, []);

    expect(result.runId).toBe('test-run');
    expect(result.status).toBe('in_progress');
    expect(result.phaseDecisions).toEqual({});
    expect(result.artifacts).toEqual([]);
    expect(result.completedAt).toBeUndefined();
    expect(result.reason).toBeUndefined();
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

  it('adds reviewer entries on reviewer_dispatched', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      { t: '2026-01-01T00:03:02Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']).toMatchObject({
      ran: true,
      status: undefined,
      criticality: undefined,
    });
    expect(result.phases.parallelReview?.reviewers?.['test-reviewer']).toMatchObject({
      ran: true,
    });
  });

  it('updates reviewer status and criticality on reviewer_completed', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      {
        t: '2026-01-01T00:03:10Z',
        event: 'reviewer_completed',
        reviewer: 'code-reviewer',
        status: 'completed',
        criticality: 'low',
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']).toMatchObject({
      status: 'completed',
      criticality: 'low',
    });
  });

  it('sets coderFixCycleRan on coder_fix_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:04:00Z', event: 'coder_fix_started', iteration: 1 },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.coderFixCycleRan).toBe(true);
  });

  it('sets selectiveReReview on re_review_dispatched', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      {
        t: '2026-01-01T00:05:00Z',
        event: 're_review_dispatched',
        reviewers: ['code-reviewer', 'test-reviewer'],
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.selectiveReReview).toMatchObject({
      ran: true,
      reviewersDispatched: ['code-reviewer', 'test-reviewer'],
      additionalFixCycleRan: false,
    });
  });

  it('updates reReviewCriticality on re_review_completed', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 're_review_completed',
        criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'low' },
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']?.reReviewCriticality).toBe('none');
    expect(result.phases.parallelReview?.reviewers?.['test-reviewer']?.reReviewCriticality).toBe('low');
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

  it('drops reviewer_dispatched when no prior review phase_started', () => {
    const header = createHeader();
    const events: RunEvent[] = [{ t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' }];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview).toBeUndefined();
  });

  it('coder_fix_completed records completedAt on the iteration', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:04:00Z', event: 'coder_fix_completed', iteration: 1 },
    ];

    const result = foldEvents(header, events);

    // parallelReview should remain in its initial state from phase_started (no coderFixCycleRan without coder_fix_started)
    expect(result.phases.parallelReview).toMatchObject({
      status: 'in_progress',
      coderFixCycleRan: false,
      reviewers: {},
    });
    // But the iteration should have the completedAt timestamp
    expect(result.phases.parallelReview?.iterations?.[0]?.coderFixCompletedAt).toBe('2026-01-01T00:04:00Z');
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

  // -- Phase startedAt/completedAt timestamps (S1) -----------------------------------

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

  // -- ReviewIteration tracking (S2) -----------------------------------------------

  it('builds review iteration from dispatched and completed events', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      { t: '2026-01-01T00:03:02Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:03:30Z',
        event: 'reviewer_completed',
        reviewer: 'code-reviewer',
        status: 'completed',
        criticality: 'low',
      },
      {
        t: '2026-01-01T00:03:35Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'none',
      },
    ];

    const result = foldEvents(header, events);

    expect(result.phases.parallelReview?.iterations).toHaveLength(1);
    expect(result.phases.parallelReview?.iterations?.[0]).toMatchObject({
      reviewers: ['code-reviewer', 'test-reviewer'],
      dispatchedAt: '2026-01-01T00:03:01Z',
      reviewsCompletedAt: '2026-01-01T00:03:35Z',
    });
  });

  it('builds full review iterations with coder fix and re-review', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      { t: '2026-01-01T00:03:02Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:03:30Z',
        event: 'reviewer_completed',
        reviewer: 'code-reviewer',
        status: 'completed',
        criticality: 'medium',
      },
      {
        t: '2026-01-01T00:03:35Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'low',
      },
      { t: '2026-01-01T00:04:00Z', event: 'coder_fix_started', iteration: 1 },
      { t: '2026-01-01T00:04:30Z', event: 'coder_fix_completed', iteration: 1 },
      { t: '2026-01-01T00:05:00Z', event: 're_review_dispatched', reviewers: ['code-reviewer'] },
      { t: '2026-01-01T00:05:30Z', event: 're_review_completed', criticalities: { 'code-reviewer': 'none' } },
    ];

    const result = foldEvents(header, events);
    const iterations = result.phases.parallelReview?.iterations;

    // First iteration: dispatch + reviews + coder fix
    expect(iterations).toHaveLength(2);
    expect(iterations?.[0]).toMatchObject({
      reviewers: ['code-reviewer', 'test-reviewer'],
      dispatchedAt: '2026-01-01T00:03:01Z',
      reviewsCompletedAt: '2026-01-01T00:03:35Z',
      coderFixStartedAt: '2026-01-01T00:04:00Z',
      coderFixCompletedAt: '2026-01-01T00:04:30Z',
    });

    // Second iteration: re-review
    expect(iterations?.[1]).toMatchObject({
      reviewers: ['code-reviewer'],
      dispatchedAt: '2026-01-01T00:05:00Z',
      reviewsCompletedAt: '2026-01-01T00:05:30Z',
    });
  });

  // -- Implementation phase folding (F2) -----------------------------------------------

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

  // -- Planning phase folding (F2) ---------------------------------------------------

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

  // -- Review phase_completed merge (W2) -----------------------------------------------

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

  // -- Unknown reviewer in re_review_completed (S1) ------------------------------------

  it('silently ignores unknown reviewers in re_review_completed without error', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:03:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:03:01Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
      {
        t: '2026-01-01T00:06:00Z',
        event: 're_review_completed',
        criticalities: { 'code-reviewer': 'low', 'unknown-reviewer': 'none' },
      },
    ];

    const result = foldEvents(header, events);

    // Known reviewer is updated
    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']?.reReviewCriticality).toBe('low');
    // Unknown reviewer is not added to the reviewers map
    expect(result.phases.parallelReview?.reviewers?.['unknown-reviewer']).toBeUndefined();
  });

  // -- Full event sequence integration test (F1) ----------------------------------------

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
      // run_started
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

      // Run completed
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

    // Run status
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe('2026-01-01T01:00:00Z');

    // Phase decisions
    expect(result.phaseDecisions).toEqual({
      architecture: { run: true, reason: 'Complex' },
      planning: { run: true, reason: 'Multi-step' },
    });

    // Artifacts
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts?.[0]?.filename).toBe('architecture.md');
    expect(result.artifacts?.[1]?.filename).toBe('plan.md');

    // Architecture phase
    expect(result.phases.architecture).toMatchObject({
      status: 'completed',
      impactLevel: 'high',
    });

    // Planning phase
    expect(result.phases.planning).toMatchObject({
      status: 'completed',
      stepCount: 7,
      artifacts: ['plan.md', 'plan.json'],
    });

    // Implementation phase
    expect(result.phases.implementation).toMatchObject({
      status: 'completed',
      qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' },
    });

    // Review phase
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

    // Simplifier phase
    expect(result.phases.codeSimplifier).toMatchObject({
      status: 'completed',
      ran: true,
      actionableFindings: false,
      coderFixCycleRan: false,
    });

    // Holistic phase
    expect(result.phases.holisticReview).toMatchObject({
      status: 'completed',
      criticality: 'none',
      coderFixCycleRan: false,
      reviewRoundsUsed: 1,
    });
  });
});
