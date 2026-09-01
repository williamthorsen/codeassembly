import { type CanonicalRunStatus, PHASE_NAMES, type PhaseName, type Phases } from 'codeassembly-run-core';

import { isPhaseEvaluated, isPhasePresentInData } from '../../../shared/phase-inference.js';

// -- Agent animation state --

/**
 * Animation states shared across all visualization types. Intentionally
 * defined here so that visualization mappers have no dependency on the
 * Excalibur game layer.
 */
export type AgentAnimationState =
  'idle' | 'working' | 'walking' | 'resting' | 'celebrating' | 'concerned' | 'deactivated';

// -- Phase status accessors --

type PhaseStatusAccessor = (phases: Phases) => string | undefined;

export const PHASE_STATUS_ACCESSORS: Record<PhaseName, PhaseStatusAccessor> = {
  architecture: (phases) => phases.architecture?.status,
  planning: (phases) => phases.planning?.status,
  implementation: (phases) => phases.implementation?.status,
  review: (phases) => {
    if (phases.parallelReview !== undefined) {
      if (phases.parallelReview.status !== undefined) {
        return phases.parallelReview.status;
      }
      const hasRunningReviewer = Object.values(phases.parallelReview.reviewers ?? {}).some(
        (r) => r.status === undefined,
      );
      return hasRunningReviewer ? 'in_progress' : 'completed';
    }
    return phases.review?.status;
  },
  simplifier: (phases) => phases.codeSimplifier?.status,
  holistic: (phases) => phases.holisticReview?.status,
  summary: () => {},
};

// -- Agent state resolution --

/**
 * Resolve the animation state for an agent at a given phase, based on the
 * run status and the inferred current phase. This logic is shared across
 * catwalk and factory-floor visualizations.
 */
export function resolveAgentState(
  phase: PhaseName,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentAnimationState {
  if (status.status === 'completed') return 'celebrating';
  if (status.status === 'failed') return 'concerned';

  // in_progress and needs_manual_review use per-phase logic
  if (phase === currentPhase && !isPhasePresentInData(phase, status.phases)) {
    return 'working';
  }

  if (PHASE_STATUS_ACCESSORS[phase](status.phases) === 'in_progress') {
    return 'working';
  }

  if (isPhaseEvaluated(phase, status.phases)) {
    return 'resting';
  }

  const currentPhaseIndex = currentPhase === undefined ? -1 : PHASE_NAMES.indexOf(currentPhase);
  if (PHASE_NAMES.indexOf(phase) < currentPhaseIndex) {
    return 'resting';
  }

  return 'idle';
}
