import type { CanonicalRunStatus } from '../src/types/canonical.ts';
import type { RunEvent } from '../src/types/run-log.ts';

export const WEIGHTS = {
  completed: 30,
  multipleReviewers: 15,
  fullPipeline: 20,
  substantiveFindings: 15,
  usageData: 5,
  eventCountInRange: 10,
  recent: 5,
} as const;

const EVENT_COUNT_MIN = 30;
const EVENT_COUNT_MAX = 80;
const RECENCY_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SignalBreakdown {
  completed: boolean;
  multipleReviewers: boolean;
  fullPipeline: boolean;
  substantiveFindings: boolean;
  usageData: boolean;
  eventCountInRange: boolean;
  recent: boolean;
}

export interface ScoreResult {
  score: number;
  signals: SignalBreakdown;
  summary: string;
}

/** Compute demo-worthiness signals and a weighted score for a single run. Pure. */
export function scoreRun(status: CanonicalRunStatus, events: ReadonlyArray<RunEvent>, now: Date): ScoreResult {
  const signals = extractSignals(status, events, now);
  const score = computeScore(signals);
  const summary = buildSummary(signals, events.length);
  return { score, signals, summary };
}

function extractSignals(status: CanonicalRunStatus, events: ReadonlyArray<RunEvent>, now: Date): SignalBreakdown {
  const review = status.phases.parallelReview;
  const reviewerCount = review?.reviewers ? Object.keys(review.reviewers).length : 0;
  const crit = review?.aggregatedCriticality;

  return {
    completed: status.status === 'completed',
    multipleReviewers: reviewerCount >= 2,
    fullPipeline: Boolean(status.phases.architecture && status.phases.planning && status.phases.parallelReview),
    substantiveFindings: crit === 'medium' || crit === 'high',
    usageData: events.some(hasUsageFields),
    eventCountInRange: events.length >= EVENT_COUNT_MIN && events.length <= EVENT_COUNT_MAX,
    recent: isRecent(status.startedAt, now),
  };
}

function computeScore(signals: SignalBreakdown): number {
  let score = 0;
  if (signals.completed) score += WEIGHTS.completed;
  if (signals.multipleReviewers) score += WEIGHTS.multipleReviewers;
  if (signals.fullPipeline) score += WEIGHTS.fullPipeline;
  if (signals.substantiveFindings) score += WEIGHTS.substantiveFindings;
  if (signals.usageData) score += WEIGHTS.usageData;
  if (signals.eventCountInRange) score += WEIGHTS.eventCountInRange;
  if (signals.recent) score += WEIGHTS.recent;
  return score;
}

function buildSummary(signals: SignalBreakdown, eventCount: number): string {
  const parts: string[] = [];
  if (signals.completed) parts.push('completed');
  if (signals.multipleReviewers) parts.push('multi-reviewer');
  if (signals.fullPipeline) parts.push('full pipeline');
  if (signals.substantiveFindings) parts.push('substantive findings');
  if (signals.usageData) parts.push('usage data');
  if (signals.recent) parts.push('recent');
  parts.push(`${String(eventCount)} events`);
  return parts.join(', ');
}

function hasUsageFields(event: RunEvent): boolean {
  return 'tokens' in event || 'toolUses' in event || 'durationMs' in event;
}

function isRecent(startedAt: string, now: Date): boolean {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  const ageMs = now.getTime() - started;
  // Future timestamps (ageMs < 0) count as recent; we don't special-case clock skew.
  return ageMs <= RECENCY_WINDOW_DAYS * MS_PER_DAY;
}
