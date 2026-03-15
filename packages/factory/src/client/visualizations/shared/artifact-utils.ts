import { ARTIFACT_COLORS } from '../../../shared/constants/artifact-colors.js';
import type { ParallelReviewPhase } from '../../../shared/types/canonical.js';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Check that a value is neither null nor undefined. The Phases type uses
 * `| undefined` but runtime data from Zod can carry `null` phase values.
 */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/** Narrow an unknown value to a non-null object (safe for `Object.keys`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Artifact color lookup
// ---------------------------------------------------------------------------

/** Maps run-index artifact type names to shared ARTIFACT_COLORS keys. */
export const ARTIFACT_TYPE_COLOR_KEY: Record<string, keyof typeof ARTIFACT_COLORS> = {
  architecture: 'arch',
  plan: 'plan',
  code: 'code',
  review: 'review',
  simplifier: 'clean',
  holistic: 'holi',
};

/** Resolve the display color for an artifact type, defaulting to the code color. */
export function lookupArtifactColor(type: string): string {
  const key = ARTIFACT_TYPE_COLOR_KEY[type];
  return key === undefined ? ARTIFACT_COLORS.code : ARTIFACT_COLORS[key];
}

// ---------------------------------------------------------------------------
// Phase agent IDs
// ---------------------------------------------------------------------------

/** Short phase alias used as agent IDs for non-review phases. */
export const PHASE_AGENT_ID: Record<string, string> = {
  architecture: 'arch',
  planning: 'plan',
  implementation: 'coder',
  simplifier: 'simp',
  holistic: 'holi',
};

// ---------------------------------------------------------------------------
// Reviewer name extraction
// ---------------------------------------------------------------------------

/**
 * Extract reviewer names from any known parallelReview data shape.
 *
 * The orchestrate skill evolved its run-index.json format, producing three
 * known shapes for the parallelReview phase:
 *   1. Flat `reviewers` record (older runs) -- keyed by reviewer name
 *   2. `iterations[].perReviewer` records -- keyed by reviewer name
 *   3. Top-level `reviewerDetails` record -- keyed by reviewer name
 *
 * Shapes 2 and 3 pass through Zod's `.partial().loose()` validation
 * as untyped extra properties. Runtime access uses defensive type narrowing.
 */
export function extractReviewerNames(parallelReview: ParallelReviewPhase): string[] {
  // Shape 1: flat reviewers record (canonical typed shape)
  const reviewers = parallelReview.reviewers;
  if (isPresent(reviewers) && Object.keys(reviewers).length > 0) {
    return Object.keys(reviewers);
  }

  // Shape 2: iterations[].perReviewer (passes through Zod .loose())
  const iterations = parallelReview.iterations;
  if (isPresent(iterations) && iterations.length > 0) {
    const names = new Set<string>();
    for (const iteration of iterations) {
      // perReviewer is an untyped property that passes through Zod .loose()
      if ('perReviewer' in iteration) {
        const perReviewer: unknown = iteration.perReviewer;
        if (isRecord(perReviewer)) {
          for (const name of Object.keys(perReviewer)) {
            names.add(name);
          }
        }
      }
      // Also collect from the typed reviewers: string[] array
      if (Array.isArray(iteration.reviewers)) {
        for (const name of iteration.reviewers) {
          names.add(name);
        }
      }
    }
    if (names.size > 0) return Array.from(names);
  }

  // Shape 3: top-level reviewerDetails (passes through Zod .loose())
  if ('reviewerDetails' in parallelReview) {
    const reviewerDetails: unknown = parallelReview.reviewerDetails;
    if (isRecord(reviewerDetails)) {
      const keys = Object.keys(reviewerDetails);
      if (keys.length > 0) return keys;
    }
  }

  return [];
}
