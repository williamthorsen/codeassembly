import type { PhaseName } from './constants/role-types.js';
import { PHASE_NAMES } from './constants/role-types.js';
import type { PhaseDecision, Phases, RunStatus } from './types/canonical.js';

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
 * Returns `true` when the phase has already produced data in `phases`.
 *
 * This mirrors the logic in `isPhaseActive()` in `run-to-scene.ts` for the
 * seven phase-to-field mappings. `summary` always returns `false` because it
 * has no phase-level data; only `runStatus === 'completed'` signals it.
 */
export function isPhasePresentInData(phase: PhaseName, phases: Phases): boolean {
  switch (phase) {
    case 'architecture':
      return phases.architecture !== undefined;
    case 'planning':
      return phases.planning !== undefined;
    case 'implementation':
      return phases.implementation !== undefined;
    case 'review':
      return (phases.parallelReview ?? phases.review) !== undefined;
    case 'simplifier':
      return phases.codeSimplifier?.ran === true;
    case 'holistic':
      return phases.holisticReview !== undefined;
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

    if (isPhasePresentInData(phase, phases)) continue;

    const decision = findPhaseDecision(phase, phaseDecisions);
    // A missing decision (including when phaseDecisions is undefined or empty)
    // is treated as "might run" — return this phase as the inferred current.
    if (decision === undefined || decision.run) return phase;
  }

  return undefined;
}
