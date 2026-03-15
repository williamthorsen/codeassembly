import type { PhaseName } from '../../../shared/constants/role-types.js';
import { PHASE_NAMES } from '../../../shared/constants/role-types.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { isPresent, lookupArtifactColor } from './artifact-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A lightweight artifact label+color pair carried by the orchestrator. */
export interface CarriedArtifact {
  label: string;
  color: string;
}

/** Code badge indicating the implementation iteration count. */
export interface CodeBadge {
  label: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Amber color for iteration v2, orange for v3+. */
export const ITERATION_COLORS = {
  v2: '#ffaa00',
  v3plus: '#ff6600',
};

// ---------------------------------------------------------------------------
// Data-model phase name to PhaseName normalization
// ---------------------------------------------------------------------------

/**
 * Map data-model phase property names to visualization-layer `PhaseName` values.
 * Used to normalize artifact `phase` fields for phase-index comparisons.
 */
export const DATA_PHASE_TO_PHASE_NAME: Record<string, PhaseName> = {
  architecture: 'architecture',
  planning: 'planning',
  implementation: 'implementation',
  review: 'review',
  parallelReview: 'review',
  codeSimplifier: 'simplifier',
  holisticReview: 'holistic',
  summary: 'summary',
};

// ---------------------------------------------------------------------------
// Carried artifacts
// ---------------------------------------------------------------------------

/**
 * Build carried artifacts for the orchestrator. When the orchestrator is
 * dispatching to a phase, carry the most recent output artifacts from the
 * nearest prior phase that produced artifacts.
 */
export function buildCarriedArtifacts(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
  working: boolean,
): CarriedArtifact[] {
  if (!working || currentPhase === undefined || !isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  const currentPhaseIndex = PHASE_NAMES.indexOf(currentPhase);
  if (currentPhaseIndex <= 0) return [];

  // Scan phases in reverse from just before the current phase
  for (let i = currentPhaseIndex - 1; i >= 0; i--) {
    const targetPhase = PHASE_NAMES[i];
    if (targetPhase === undefined) continue;

    const phaseArtifacts = status.artifacts.filter((a) => {
      const normalized = DATA_PHASE_TO_PHASE_NAME[a.phase];
      return normalized === targetPhase;
    });

    if (phaseArtifacts.length > 0) {
      return phaseArtifacts.map((a) => ({
        label: a.type,
        color: lookupArtifactColor(a.type),
      }));
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Code badge
// ---------------------------------------------------------------------------

/** Build the code badge showing iteration count when implementation has been re-entered. */
export function buildCodeBadge(status: CanonicalRunStatus): CodeBadge | null {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return null;
  }

  // Find the max iteration value among implementation-phase artifacts
  let maxIteration = 0;
  for (const artifact of status.artifacts) {
    if (
      (artifact.phase === 'implementation' || artifact.phase === 'codeSimplifier') &&
      isPresent(artifact.iteration) &&
      artifact.iteration > maxIteration
    ) {
      maxIteration = artifact.iteration;
    }
  }

  if (maxIteration <= 1) {
    return null;
  }

  const color = maxIteration === 2 ? ITERATION_COLORS.v2 : ITERATION_COLORS.v3plus;
  return { label: `v${String(maxIteration)}`, color };
}
