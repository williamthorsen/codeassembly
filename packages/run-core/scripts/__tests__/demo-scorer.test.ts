import { describe, expect, it } from 'vitest';

import type {
  ArchitecturePhase,
  CanonicalRunStatus,
  Criticality,
  ParallelReviewPhase,
  PlanningPhase,
  ReviewerInfo,
  RunStatus,
} from '../../src/types/canonical.js';
import type { RunEvent } from '../../src/types/run-log.js';
import { scoreRun, WEIGHTS } from '../demo-scorer.js';

const NOW = new Date('2026-04-19T00:00:00Z');

function buildStatus(
  overrides: {
    status?: RunStatus;
    startedAt?: string;
    reviewerCount?: number;
    aggregatedCriticality?: Criticality | undefined;
    hasArchitecture?: boolean;
    hasPlanning?: boolean;
    hasParallelReview?: boolean;
  } = {},
): CanonicalRunStatus {
  const {
    status = 'in_progress',
    startedAt = '2026-04-18T00:00:00Z',
    reviewerCount = 0,
    aggregatedCriticality,
    hasArchitecture = false,
    hasPlanning = false,
    hasParallelReview = false,
  } = overrides;

  const architecture: ArchitecturePhase | undefined = hasArchitecture
    ? { status: 'completed', impactLevel: 'low', artifact: undefined }
    : undefined;

  const planning: PlanningPhase | undefined = hasPlanning
    ? { status: 'completed', stepCount: 1, artifacts: undefined }
    : undefined;

  const parallelReview: ParallelReviewPhase | undefined = hasParallelReview
    ? {
        aggregatedCriticality,
        reviewRoundsUsed: 1,
        reviewers: buildReviewers(reviewerCount),
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      }
    : undefined;

  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test',
    startedAt,
    completedAt: undefined,
    status,
    reason: undefined,
    externalPlan: undefined,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
    waitingForInput: undefined,
    phases: {
      architecture,
      planning,
      implementation: undefined,
      parallelReview,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    phaseDecisions: undefined,
    artifacts: undefined,
  };
}

function buildReviewers(count: number): Record<string, ReviewerInfo> {
  const reviewers: Record<string, ReviewerInfo> = {};
  for (let i = 0; i < count; i++) {
    reviewers[`reviewer-${String(i)}`] = {
      ran: true,
      status: 'completed',
      criticality: 'none',
      reason: undefined,
      reReviewCriticality: undefined,
      reReviewError: undefined,
    };
  }
  return reviewers;
}

function buildEvents(count: number, options: { withUsage?: boolean } = {}): RunEvent[] {
  const events: RunEvent[] = [];
  for (let i = 0; i < count; i++) {
    if (options.withUsage && i === 0) {
      events.push({ t: '2026-04-18T00:00:00Z', event: 'run_started' });
      continue;
    }
    events.push({ t: '2026-04-18T00:00:00Z', event: 'run_started' });
  }
  return events;
}

function perfectStatus(): CanonicalRunStatus {
  return buildStatus({
    status: 'completed',
    startedAt: '2026-04-10T00:00:00Z',
    reviewerCount: 4,
    aggregatedCriticality: 'high',
    hasArchitecture: true,
    hasPlanning: true,
    hasParallelReview: true,
  });
}

function perfectEvents(): RunEvent[] {
  const events: RunEvent[] = [
    { t: '2026-04-10T00:01:00Z', event: 'phase_completed', phase: 'architecture', status: 'completed', tokens: 1000 },
  ];
  // Add one usage-carrying event.
  for (let i = 1; i < 50; i++) {
    events.push({ t: '2026-04-10T00:00:00Z', event: 'run_started' });
  }
  return events;
}

describe('scoreRun', () => {
  describe('aggregate behavior', () => {
    it('scores a perfect run at 100', () => {
      const result = scoreRun(perfectStatus(), perfectEvents(), NOW);

      expect(result.score).toBe(100);
      expect(result.signals).toEqual({
        completed: true,
        multipleReviewers: true,
        fullPipeline: true,
        substantiveFindings: true,
        usageData: true,
        eventCountInRange: true,
        recent: true,
      });
      expect(result.summary).toContain('completed');
      expect(result.summary).toContain('multi-reviewer');
      expect(result.summary).toContain('full pipeline');
      expect(result.summary).toContain('substantive findings');
      expect(result.summary).toContain('usage data');
      expect(result.summary).toContain('recent');
      expect(result.summary).toContain('50 events');
    });

    it('scores a baseline run with no signals at 0', () => {
      const result = scoreRun(buildStatus({ startedAt: '2020-01-01T00:00:00Z' }), buildEvents(5), NOW);

      expect(result.score).toBe(0);
      expect(result.signals).toEqual({
        completed: false,
        multipleReviewers: false,
        fullPipeline: false,
        substantiveFindings: false,
        usageData: false,
        eventCountInRange: false,
        recent: false,
      });
      expect(result.summary).toBe('5 events');
    });
  });

  describe('individual signal weights', () => {
    it('completed alone = WEIGHTS.completed', () => {
      const status = buildStatus({ status: 'completed', startedAt: '2020-01-01T00:00:00Z' });
      const result = scoreRun(status, buildEvents(10), NOW);
      expect(result.score).toBe(WEIGHTS.completed);
      expect(result.signals.completed).toBe(true);
    });

    it('multipleReviewers alone = WEIGHTS.multipleReviewers', () => {
      const status = buildStatus({
        startedAt: '2020-01-01T00:00:00Z',
        reviewerCount: 2,
        hasParallelReview: true,
      });
      const result = scoreRun(status, buildEvents(10), NOW);
      expect(result.score).toBe(WEIGHTS.multipleReviewers);
    });

    it('fullPipeline alone = WEIGHTS.fullPipeline', () => {
      const status = buildStatus({
        startedAt: '2020-01-01T00:00:00Z',
        hasArchitecture: true,
        hasPlanning: true,
        hasParallelReview: true,
      });
      const result = scoreRun(status, buildEvents(10), NOW);
      expect(result.score).toBe(WEIGHTS.fullPipeline);
    });

    it('substantiveFindings alone = WEIGHTS.substantiveFindings', () => {
      const status = buildStatus({
        startedAt: '2020-01-01T00:00:00Z',
        aggregatedCriticality: 'medium',
        hasParallelReview: true,
      });
      const result = scoreRun(status, buildEvents(10), NOW);
      // substantiveFindings implies parallelReview presence but not architecture/planning, so no fullPipeline.
      expect(result.score).toBe(WEIGHTS.substantiveFindings);
    });

    it('usageData alone = WEIGHTS.usageData', () => {
      const status = buildStatus({ startedAt: '2020-01-01T00:00:00Z' });
      const events: RunEvent[] = [
        {
          t: '2020-01-01T00:00:00Z',
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          tokens: 100,
        },
      ];
      const result = scoreRun(status, events, NOW);
      expect(result.score).toBe(WEIGHTS.usageData);
    });

    it('eventCountInRange alone = WEIGHTS.eventCountInRange', () => {
      const status = buildStatus({ startedAt: '2020-01-01T00:00:00Z' });
      const result = scoreRun(status, buildEvents(50), NOW);
      expect(result.score).toBe(WEIGHTS.eventCountInRange);
    });

    it('recent alone = WEIGHTS.recent', () => {
      const status = buildStatus({ startedAt: '2026-04-18T00:00:00Z' });
      const result = scoreRun(status, buildEvents(10), NOW);
      expect(result.score).toBe(WEIGHTS.recent);
    });
  });

  describe('event-count boundaries', () => {
    const baseStatus = () => buildStatus({ startedAt: '2020-01-01T00:00:00Z' });

    it('29 events is out of range', () => {
      expect(scoreRun(baseStatus(), buildEvents(29), NOW).signals.eventCountInRange).toBe(false);
    });

    it('30 events is in range', () => {
      expect(scoreRun(baseStatus(), buildEvents(30), NOW).signals.eventCountInRange).toBe(true);
    });

    it('80 events is in range', () => {
      expect(scoreRun(baseStatus(), buildEvents(80), NOW).signals.eventCountInRange).toBe(true);
    });

    it('81 events is out of range', () => {
      expect(scoreRun(baseStatus(), buildEvents(81), NOW).signals.eventCountInRange).toBe(false);
    });
  });

  describe('recency boundaries', () => {
    it('startedAt exactly 30 days before now is recent', () => {
      const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const status = buildStatus({ startedAt: thirtyDaysAgo });
      expect(scoreRun(status, buildEvents(5), NOW).signals.recent).toBe(true);
    });

    it('startedAt 30 days + 1 second before now is not recent', () => {
      const justTooOld = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000 - 1000).toISOString();
      const status = buildStatus({ startedAt: justTooOld });
      expect(scoreRun(status, buildEvents(5), NOW).signals.recent).toBe(false);
    });

    it('future startedAt is treated as recent (no clock-skew handling)', () => {
      const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const status = buildStatus({ startedAt: future });
      expect(scoreRun(status, buildEvents(5), NOW).signals.recent).toBe(true);
    });

    it('unparseable startedAt is not recent', () => {
      const status = buildStatus({ startedAt: 'not-a-date' });
      expect(scoreRun(status, buildEvents(5), NOW).signals.recent).toBe(false);
    });
  });

  describe('substantiveFindings by criticality', () => {
    const baseOverrides = {
      startedAt: '2020-01-01T00:00:00Z',
      hasParallelReview: true,
    };

    it('none → false', () => {
      const status = buildStatus({ ...baseOverrides, aggregatedCriticality: 'none' });
      expect(scoreRun(status, buildEvents(5), NOW).signals.substantiveFindings).toBe(false);
    });

    it('low → false', () => {
      const status = buildStatus({ ...baseOverrides, aggregatedCriticality: 'low' });
      expect(scoreRun(status, buildEvents(5), NOW).signals.substantiveFindings).toBe(false);
    });

    it('medium → true', () => {
      const status = buildStatus({ ...baseOverrides, aggregatedCriticality: 'medium' });
      expect(scoreRun(status, buildEvents(5), NOW).signals.substantiveFindings).toBe(true);
    });

    it('high → true', () => {
      const status = buildStatus({ ...baseOverrides, aggregatedCriticality: 'high' });
      expect(scoreRun(status, buildEvents(5), NOW).signals.substantiveFindings).toBe(true);
    });

    it('undefined criticality → false', () => {
      const status = buildStatus({ ...baseOverrides, aggregatedCriticality: undefined });
      expect(scoreRun(status, buildEvents(5), NOW).signals.substantiveFindings).toBe(false);
    });
  });

  describe('multipleReviewers by count', () => {
    const withReviewers = (count: number): CanonicalRunStatus =>
      buildStatus({
        startedAt: '2020-01-01T00:00:00Z',
        reviewerCount: count,
        hasParallelReview: true,
      });

    it('0 reviewers → false', () => {
      expect(scoreRun(withReviewers(0), buildEvents(5), NOW).signals.multipleReviewers).toBe(false);
    });

    it('1 reviewer → false', () => {
      expect(scoreRun(withReviewers(1), buildEvents(5), NOW).signals.multipleReviewers).toBe(false);
    });

    it('2 reviewers → true', () => {
      expect(scoreRun(withReviewers(2), buildEvents(5), NOW).signals.multipleReviewers).toBe(true);
    });

    it('5 reviewers → true', () => {
      expect(scoreRun(withReviewers(5), buildEvents(5), NOW).signals.multipleReviewers).toBe(true);
    });
  });

  describe('usageData detection', () => {
    const status = () => buildStatus({ startedAt: '2020-01-01T00:00:00Z' });

    it('no usage fields → false', () => {
      const events: RunEvent[] = [{ t: '2020-01-01T00:00:00Z', event: 'run_started' }];
      expect(scoreRun(status(), events, NOW).signals.usageData).toBe(false);
    });

    it('any event with tokens → true', () => {
      const events: RunEvent[] = [
        { t: '2020-01-01T00:00:00Z', event: 'run_started' },
        { t: '2020-01-01T00:01:00Z', event: 'phase_completed', phase: 'architecture', status: 'completed', tokens: 50 },
      ];
      expect(scoreRun(status(), events, NOW).signals.usageData).toBe(true);
    });

    it('any event with toolUses → true', () => {
      const events: RunEvent[] = [
        {
          t: '2020-01-01T00:00:00Z',
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          toolUses: 3,
        },
      ];
      expect(scoreRun(status(), events, NOW).signals.usageData).toBe(true);
    });

    it('any event with durationMs → true', () => {
      const events: RunEvent[] = [
        {
          t: '2020-01-01T00:00:00Z',
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          durationMs: 1234,
        },
      ];
      expect(scoreRun(status(), events, NOW).signals.usageData).toBe(true);
    });
  });

  describe('fullPipeline detection', () => {
    const base = { startedAt: '2020-01-01T00:00:00Z' };

    it('missing architecture → false', () => {
      const status = buildStatus({ ...base, hasPlanning: true, hasParallelReview: true });
      expect(scoreRun(status, buildEvents(5), NOW).signals.fullPipeline).toBe(false);
    });

    it('missing planning → false', () => {
      const status = buildStatus({ ...base, hasArchitecture: true, hasParallelReview: true });
      expect(scoreRun(status, buildEvents(5), NOW).signals.fullPipeline).toBe(false);
    });

    it('missing parallelReview → false', () => {
      const status = buildStatus({ ...base, hasArchitecture: true, hasPlanning: true });
      expect(scoreRun(status, buildEvents(5), NOW).signals.fullPipeline).toBe(false);
    });

    it('all three present → true', () => {
      const status = buildStatus({
        ...base,
        hasArchitecture: true,
        hasPlanning: true,
        hasParallelReview: true,
      });
      expect(scoreRun(status, buildEvents(5), NOW).signals.fullPipeline).toBe(true);
    });
  });
});
