import type { CanonicalRunStatus, ParallelReviewPhase, ReviewIteration } from '../types/canonical.ts';
import type { RunEvent } from '../types/run-log.ts';
import { extractUsage } from './event-fields.ts';

type ReviewEvent = Extract<
  RunEvent,
  {
    event:
      | 'reviewer_dispatched'
      | 'reviewer_completed'
      | 'coder_fix_started'
      | 'coder_fix_completed'
      | 're_review_dispatched'
      | 're_review_completed';
  }
>;

/** Applies a review event to the parallel-review phase, or drops the event when that phase has not started. */
export function applyReviewEvent(state: CanonicalRunStatus, event: ReviewEvent): void {
  const review = state.phases.parallelReview;
  if (!review) return;

  switch (event.event) {
    case 'reviewer_dispatched':
      applyReviewerDispatched(review, event);
      break;
    case 'reviewer_completed':
      applyReviewerCompleted(review, event);
      break;
    case 'coder_fix_started':
      review.coderFixCycleRan = true;
      ensureIteration(review, event.iteration - 1).coderFixStartedAt = event.t;
      break;
    case 'coder_fix_completed': {
      const iter = ensureIteration(review, event.iteration - 1);
      iter.coderFixCompletedAt = event.t;
      const usage = extractUsage(event);
      if (usage) {
        iter.usage = usage;
      }
      break;
    }
    case 're_review_dispatched':
      applyReReviewDispatched(review, event);
      break;
    case 're_review_completed':
      applyReReviewCompleted(review, event);
      break;
  }
}

// region | Helpers

/** Records each known reviewer's re-review criticality and completes the last iteration. */
function applyReReviewCompleted(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 're_review_completed' }>,
): void {
  for (const [reviewer, crit] of Object.entries(event.criticalities)) {
    const entry = review.reviewers?.[reviewer];
    if (entry) {
      entry.reReviewCriticality = crit;
    }
  }
  const iterations = review.iterations ?? [];
  const lastIdx = iterations.length > 0 ? iterations.length - 1 : 0;
  const lastIter = ensureIteration(review, lastIdx);
  lastIter.reviewsCompletedAt = event.t;
  const usage = extractUsage(event);
  if (usage) {
    lastIter.reReviewUsage = usage;
  }
}

/** Records the re-review dispatch as a new iteration after the existing ones. Index 0 belongs to the initial review. */
function applyReReviewDispatched(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 're_review_dispatched' }>,
): void {
  review.selectiveReReview = {
    ran: true,
    reviewersDispatched: event.reviewers,
    additionalFixCycleRan: false,
  };
  const iterations = review.iterations ?? [];
  const nextIdx = iterations.length > 0 ? iterations.length : 1;
  const reIter = ensureIteration(review, nextIdx);
  reIter.reviewers = event.reviewers;
  reIter.dispatchedAt = event.t;
}

/** Records a reviewer's result and the time at which the first iteration's reviews completed. */
function applyReviewerCompleted(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 'reviewer_completed' }>,
): void {
  const entry = review.reviewers?.[event.reviewer];
  if (entry) {
    entry.status = event.status;
    entry.criticality = event.criticality;
    const usage = extractUsage(event);
    if (usage) {
      entry.usage = usage;
    }
  }
  const firstIter = ensureIteration(review, 0);
  firstIter.reviewsCompletedAt = event.t;
}

/** Registers the reviewer on the review phase and adds it to the first iteration. */
function applyReviewerDispatched(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 'reviewer_dispatched' }>,
): void {
  review.reviewers ??= {};
  review.reviewers[event.reviewer] = {
    ran: true,
    status: undefined,
    criticality: undefined,
    reason: undefined,
    reReviewCriticality: undefined,
    reReviewError: undefined,
  };
  const iter0 = ensureIteration(review, 0);
  if (!iter0.reviewers.includes(event.reviewer)) {
    iter0.reviewers.push(event.reviewer);
  }
  iter0.dispatchedAt ??= event.t;
}

/** Ensures the iterations array has an entry at the given zero-based index and returns it. */
function ensureIteration(review: { iterations?: ReviewIteration[] }, index: number): ReviewIteration {
  review.iterations ??= [];
  let iteration = review.iterations[index];
  if (!iteration) {
    iteration = { reviewers: [] };
    review.iterations[index] = iteration;
  }
  return iteration;
}

// endregion | Helpers
