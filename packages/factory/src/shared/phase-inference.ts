import { PHASE_NAMES, type PhaseDecision, type PhaseName, type Phases, type RunStatus } from 'codeassembly-run-core';

/**
 * Maps phase names to their possible `phaseDecisions` object keys.
 *
 * Most phases use their `PhaseName` string directly as the key in `phaseDecisions`.
 * The `review` phase is an exception: v2 data uses `'review-cycle'` while v1 data
 * uses `'review'`. The v2 key is tried first.
 */
export const PHASE_DECISION_KEYS: Partial<Record<PhaseName, string[]>> = {
  review: ['review-cycle', 'review'],
};

/**
 * Resolve the phase decision for a given phase by trying all known keys from
 * `PHASE_DECISION_KEYS`, falling back to the `PhaseName` string itself.
 */
export function findPhaseDecision(
  phase: PhaseName,
  phaseDecisions: Record<string, PhaseDecision> | undefined,
): PhaseDecision | undefined {
  if (phaseDecisions === undefined) return undefined;

  const keys = PHASE_DECISION_KEYS[phase] ?? [phase];
  for (const key of keys) {
    const decision = phaseDecisions[key];
    if (decision !== undefined) return decision;
  }
  return undefined;
}

/**
 * Check that a value is neither null nor undefined. The Phases type uses
 * `| undefined` but runtime data from Zod can carry `null` phase values
 * (meaning "phase not yet reached"). This helper handles both cases while
 * satisfying the eqeqeq lint rule.
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/**
 * Check whether a phase with a `status` field is present and not in progress.
 * Returns `true` when data is present and the status is anything other than `'in_progress'`.
 */
function isPresentAndNotInProgress(value: { status?: string } | null | undefined): boolean {
  return isPresent(value) && value.status !== 'in_progress';
}

/**
 * Check whether the review phase is evaluated, handling both the `parallelReview`
 * and legacy `review` formats.
 *
 * For backward compatibility, a `parallelReview` object with `status === undefined`
 * (old data without the explicit status field) is treated as evaluated. Only an
 * explicit `'in_progress'` blocks advancement.
 */
function isReviewEvaluated(phases: Phases): boolean {
  if (isPresent(phases.parallelReview)) {
    return phases.parallelReview.status !== 'in_progress';
  }
  if (isPresent(phases.review)) {
    return phases.review.status !== 'in_progress';
  }
  return false;
}

/**
 * Returns `true` when the orchestrator has finished evaluating the phase —
 * meaning data has been written AND the phase is not actively in progress.
 *
 * Used by `findCurrentPhase` to determine whether to advance past this phase.
 * Returns `false` when the phase has `status === 'in_progress'`, preventing
 * the current-phase pointer from skipping past an active phase during
 * incremental writes.
 *
 * For the simplifier, `codeSimplifier: { ran: false }` counts as evaluated
 * because the orchestrator made a decision — the phase should not be
 * re-inferred as "current." An explicit `status: "in_progress"` blocks
 * advancement, consistent with all other phases. Missing `status` is
 * treated as evaluated for backward compatibility with data written before
 * the `status` field was added.
 *
 * `summary` always returns `false` because it has no phase-level data; only
 * `runStatus === 'completed'` signals it.
 */
export function isPhaseEvaluated(phase: PhaseName, phases: Phases): boolean {
  switch (phase) {
    case 'architecture':
      return isPresentAndNotInProgress(phases.architecture);
    case 'planning':
      return isPresentAndNotInProgress(phases.planning);
    case 'implementation':
      return isPresentAndNotInProgress(phases.implementation);
    case 'review':
      return isReviewEvaluated(phases);
    case 'simplifier':
      return isPresentAndNotInProgress(phases.codeSimplifier);
    case 'holistic':
      return isPresentAndNotInProgress(phases.holisticReview);
    case 'summary':
      return false;
    default:
      return false;
  }
}

/**
 * Check whether the code simplifier has meaningful data for display.
 * Returns `true` when `ran` is `true` (phase completed) or `status` is
 * `'in_progress'` (phase is currently running). `ran: false` without an
 * in-progress status means the orchestrator decided not to run the
 * simplifier, so no agent or active station should be shown.
 */
function isSimplifierPresentInData(phases: Phases): boolean {
  return phases.codeSimplifier?.ran === true || phases.codeSimplifier?.status === 'in_progress';
}

/**
 * Returns `true` when the phase has produced meaningful data for display,
 * including phases that are currently in progress.
 *
 * Used by `isPhaseActive()` and `shouldShowPhaseAgent()` in `run-to-scene.ts`
 * to control station activation and agent visibility.
 *
 * Unlike `isPhaseEvaluated`, this returns `true` for in-progress phases so
 * that stations and agents remain visible while a phase is running.
 *
 * `summary` always returns `false` because it has no phase-level data; only
 * `runStatus === 'completed'` signals it.
 */
export function isPhasePresentInData(phase: PhaseName, phases: Phases): boolean {
  switch (phase) {
    case 'architecture':
      return isPresent(phases.architecture);
    case 'planning':
      return isPresent(phases.planning);
    case 'implementation':
      return isPresent(phases.implementation);
    case 'review':
      return isPresent(phases.parallelReview ?? phases.review);
    case 'simplifier':
      return isSimplifierPresentInData(phases);
    case 'holistic':
      return isPresent(phases.holisticReview);
    case 'summary':
      return false;
    default:
      return false;
  }
}

/**
 * Infer the currently active phase from `phaseDecisions` and `phases` data.
 *
 * Returns the first phase (in `PHASE_NAMES` order) that:
 * - has no data in `phases` yet, AND
 * - is not decided to skip (`phaseDecisions[key].run !== false`)
 *
 * Returns `undefined` when:
 * - `runStatus` is not `'in_progress'`
 * - All phases already have data
 * - All remaining phases are decided to skip
 */
export function findCurrentPhase(
  phases: Phases,
  phaseDecisions: Record<string, PhaseDecision> | undefined,
  runStatus: RunStatus,
): PhaseName | undefined {
  if (runStatus !== 'in_progress') return undefined;

  for (const phase of PHASE_NAMES) {
    // Summary is never an inferred current phase. It completes only when the
    // run completes, and inference only applies to in_progress runs.
    if (phase === 'summary') continue;

    if (isPhaseEvaluated(phase, phases)) continue;

    const decision = findPhaseDecision(phase, phaseDecisions);
    // A missing decision (including when phaseDecisions is undefined or empty)
    // is treated as "might run" — return this phase as the inferred current.
    if (decision === undefined || decision.run) return phase;
  }

  return undefined;
}
