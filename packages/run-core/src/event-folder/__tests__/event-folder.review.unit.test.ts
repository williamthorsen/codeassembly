import { describe, expect, it } from 'vitest';

import type { RunEvent } from '../../types/run-log.ts';
import { foldEvents } from '../event-folder.ts';
import { createHeader } from '../test-utils/create-header.ts';

describe('foldEvents', () => {
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

  it('drops reviewer_dispatched when a review phase_started does not precede it', () => {
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

    // parallelReview should remain in its initial state from phase_started (the fold doesn't set coderFixCycleRan
    // without coder_fix_started)
    expect(result.phases.parallelReview).toMatchObject({
      status: 'in_progress',
      coderFixCycleRan: false,
      reviewers: {},
    });
    expect(result.phases.parallelReview?.iterations?.[0]?.coderFixCompletedAt).toBe('2026-01-01T00:04:00Z');
  });

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

    expect(result.phases.parallelReview?.reviewers?.['code-reviewer']?.reReviewCriticality).toBe('low');
    expect(result.phases.parallelReview?.reviewers?.['unknown-reviewer']).toBeUndefined();
  });

  it('folds usage metrics from reviewer_completed into ReviewerInfo', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:01:01Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'low',
        tokens: 45_000,
        toolUses: 12,
        durationMs: 30_000,
      },
    ];
    const state = foldEvents(header, events);
    expect(state.phases.parallelReview?.reviewers?.['test-reviewer']?.usage).toEqual({
      tokens: 45_000,
      toolUses: 12,
      durationMs: 30_000,
    });
  });

  it('folds usage metrics from coder_fix_completed into ReviewIteration', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:01:01Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'low',
      },
      { t: '2026-01-01T00:03:00Z', event: 'coder_fix_started', iteration: 1 },
      {
        t: '2026-01-01T00:05:00Z',
        event: 'coder_fix_completed',
        iteration: 1,
        tokens: 80_000,
        toolUses: 25,
        durationMs: 120_000,
      },
    ];
    const state = foldEvents(header, events);
    expect(state.phases.parallelReview?.iterations?.[0]?.usage).toEqual({
      tokens: 80_000,
      toolUses: 25,
      durationMs: 120_000,
    });
  });

  it('folds usage metrics from re_review_completed into ReviewIteration', () => {
    const header = createHeader();
    const events: RunEvent[] = [
      { t: '2026-01-01T00:00:00Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'review' },
      { t: '2026-01-01T00:01:01Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'reviewer_completed',
        reviewer: 'test-reviewer',
        status: 'completed',
        criticality: 'low',
      },
      { t: '2026-01-01T00:03:00Z', event: 're_review_dispatched', reviewers: ['test-reviewer'] },
      {
        t: '2026-01-01T00:04:00Z',
        event: 're_review_completed',
        criticalities: { 'test-reviewer': 'none' },
        tokens: 29_000,
        toolUses: 8,
        durationMs: 25_000,
      },
    ];
    const state = foldEvents(header, events);
    // re_review_dispatched creates iteration at index 1; re_review_completed targets the last iteration
    expect(state.phases.parallelReview?.iterations?.[1]?.reReviewUsage).toEqual({
      tokens: 29_000,
      toolUses: 8,
      durationMs: 25_000,
    });
  });
});
