import type { PhaseName } from '../../../shared/constants/role-types.js';
import { PHASE_NAMES } from '../../../shared/constants/role-types.js';
import type { CanonicalRunStatus, Phases, PhaseStatus } from '../../../shared/types/canonical.js';
import type { AgentConfig } from '../mappers/run-to-scene.js';
import type { AgentAnimationState } from '../sprites/sprite-definitions.js';

export interface AgentStateInfo {
  role: string;
  stationIndex: number;
  animationState: AgentAnimationState;
}

type PhaseStatusAccessor = (phases: Phases) => PhaseStatus | undefined;

/**
 * Map phase names to accessors that extract the phase status.
 *
 * - `review` checks parallelReview first (any reviewer with undefined status means in_progress),
 *   then falls back to legacy review.
 * - `simplifier` and `summary` have no in-progress PhaseStatus in the canonical model;
 *   they return undefined unconditionally.
 */
const PHASE_STATUS_ACCESSORS: Record<PhaseName, PhaseStatusAccessor> = {
  architecture: (phases) => phases.architecture?.status,
  planning: (phases) => phases.planning?.status,
  implementation: (phases) => phases.implementation?.status,
  review: (phases) => {
    if (phases.parallelReview !== undefined) {
      const hasRunningReviewer = Object.values(phases.parallelReview.reviewers).some((r) => r.status === undefined);
      return hasRunningReviewer ? 'in_progress' : 'completed';
    }
    return phases.review?.status;
  },
  // The code simplifier phase tracks `ran` and `actionableFindings` but not a PhaseStatus.
  simplifier: () => {},
  holistic: (phases) => phases.holisticReview?.status,
  // The summary phase has no in-progress status; it maps to run completion.
  summary: () => {},
};

/** Determine whether the phase at the given station index is currently in progress. */
function isPhaseInProgress(stationIndex: number, phases: Phases): boolean {
  const phaseName = PHASE_NAMES[stationIndex];
  if (phaseName === undefined) return false;

  return PHASE_STATUS_ACCESSORS[phaseName](phases) === 'in_progress';
}

/** Build an AgentStateInfo from an agent config and animation state. */
function buildStateInfo(agent: AgentConfig, animationState: AgentAnimationState): AgentStateInfo {
  return {
    role: agent.role,
    stationIndex: agent.stationIndex,
    animationState,
  };
}

/**
 * Resolve the animation state for each agent based on the current run status.
 *
 * Resolution priority:
 * 1. Run completed -> all agents celebrating
 * 2. Run failed -> all agents concerned
 * 3. Agent's phase in_progress -> working
 * 4. Otherwise -> idle
 */
export function resolveAgentStates(agents: ReadonlyArray<AgentConfig>, status: CanonicalRunStatus): AgentStateInfo[] {
  if (status.status === 'completed') {
    return agents.map((agent) => buildStateInfo(agent, 'celebrating'));
  }

  if (status.status === 'failed') {
    return agents.map((agent) => buildStateInfo(agent, 'concerned'));
  }

  return agents.map((agent) => {
    const animationState: AgentAnimationState = isPhaseInProgress(agent.stationIndex, status.phases)
      ? 'working'
      : 'idle';
    return buildStateInfo(agent, animationState);
  });
}
