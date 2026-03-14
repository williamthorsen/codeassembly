import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { isPresent, lookupArtifactColor, PHASE_TO_STATION } from './artifact-utils.js';

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
// Carried artifacts
// ---------------------------------------------------------------------------

/**
 * Build carried artifacts for the orchestrator. When the orchestrator is working
 * (delivering to a station), carry the most recent output artifacts from the
 * previous non-absent station.
 */
export function buildCarriedArtifacts(
  status: CanonicalRunStatus,
  stationIndex: number,
  working: boolean,
): CarriedArtifact[] {
  if (!working || stationIndex <= 0 || !isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  // Find the most recent output artifacts from previous stations
  // Scan stations in reverse from the orchestrator's current position
  for (let i = stationIndex - 1; i >= 0; i--) {
    const stationArtifacts = status.artifacts.filter((a) => PHASE_TO_STATION[a.phase] === i);

    if (stationArtifacts.length > 0) {
      return stationArtifacts.map((a) => ({
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
    const stationIndex = PHASE_TO_STATION[artifact.phase];
    if (stationIndex === 2 && isPresent(artifact.iteration) && artifact.iteration > maxIteration) {
      maxIteration = artifact.iteration;
    }
  }

  if (maxIteration <= 1) {
    return null;
  }

  const color = maxIteration === 2 ? ITERATION_COLORS.v2 : ITERATION_COLORS.v3plus;
  return { label: `v${String(maxIteration)}`, color };
}
