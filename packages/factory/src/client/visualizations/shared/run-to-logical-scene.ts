import type { CanonicalRunStatus, PhaseName } from 'codeassembly-run-core';

import { findCurrentPhase, isPhasePresentInData } from '../../../shared/phase-inference.js';
import { type AgentAnimationState, resolveAgentState } from './agent-state-resolver.js';
import { isPresent, lookupArtifactColor } from './artifact-utils.js';
import { type AgentRosterEntry, deriveAgentRoster } from './derive-agent-roster.js';
import { buildCarriedArtifacts, buildCodeBadge, DATA_PHASE_TO_PHASE_NAME } from './orchestrator-utils.js';
import type {
  AgentStatus,
  ArtifactStatus,
  LogicalAgentState,
  LogicalArtifactState,
  LogicalOrchestratorState,
  LogicalSceneState,
  OrchestratorStatus,
} from './types.js';

// -- Animation state to agent status mapping --

/** Collapse fine-grained animation state to logical agent status. */
function mapAnimationToAgentStatus(state: AgentAnimationState): AgentStatus {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'working':
    case 'walking':
      return 'working';
    case 'resting':
    case 'celebrating':
      return 'done';
    case 'concerned':
      return 'concerned';
    case 'deactivated':
      return 'idle';
  }
}

// region | Sub-function: agent states

/** Build logical agent states from the roster and run status. */
function buildAgentStates(
  roster: AgentRosterEntry[],
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): LogicalAgentState[] {
  return roster.map((entry) => {
    const animState = resolveAgentState(entry.phase, status, currentPhase);

    return {
      id: entry.agentId,
      role: entry.role,
      roleType: entry.roleType,
      phase: entry.phase,
      status: mapAnimationToAgentStatus(animState),
    };
  });
}

// endregion | Sub-function: agent states

// region | Sub-function: orchestrator state

/** Derive the logical orchestrator state from run status and current phase. */
function buildOrchestratorState(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): LogicalOrchestratorState {
  let orchStatus: OrchestratorStatus;
  if (status.status === 'completed' || status.status === 'failed') {
    orchStatus = 'done';
  } else if (currentPhase === undefined) {
    orchStatus = 'idle';
  } else if (isPhasePresentInData(currentPhase, status.phases)) {
    orchStatus = 'monitoring';
  } else {
    orchStatus = 'dispatching';
  }

  const working = currentPhase !== undefined && !isPhasePresentInData(currentPhase, status.phases);
  const carriedArtifacts = buildCarriedArtifacts(status, currentPhase, working);
  const codeBadge = buildCodeBadge(status);
  const waiting = isPresent(status.waitingForInput) && status.status === 'in_progress';

  return { status: orchStatus, carriedArtifacts, codeBadge, waiting };
}

// endregion | Sub-function: orchestrator state

// region | Sub-function: artifact states

/** Check whether a phase object is present and has completed. */
function isPhaseCompleted(phase: { status?: string } | undefined): boolean {
  return isPresent(phase) && phase.status === 'completed';
}

/**
 * Determine the artifact lifecycle status based on whether the producing
 * phase has completed.
 */
function resolveArtifactStatus(producerPhase: PhaseName, status: CanonicalRunStatus): ArtifactStatus {
  if (status.status === 'completed') return 'delivered';

  const phases = status.phases;
  switch (producerPhase) {
    case 'architecture':
      return isPhaseCompleted(phases.architecture) ? 'delivered' : 'created';
    case 'planning':
      return isPhaseCompleted(phases.planning) ? 'delivered' : 'created';
    case 'implementation':
      return isPhaseCompleted(phases.implementation) ? 'delivered' : 'created';
    case 'review':
      return isPhaseCompleted(phases.parallelReview) || isPhaseCompleted(phases.review) ? 'delivered' : 'created';
    case 'simplifier':
      return phases.codeSimplifier?.ran === true ? 'delivered' : 'created';
    case 'holistic':
      return isPhaseCompleted(phases.holisticReview) ? 'delivered' : 'created';
    default:
      return 'created';
  }
}

/** Build logical artifact states from run status. */
function buildArtifactStates(status: CanonicalRunStatus): LogicalArtifactState[] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  const artifacts: LogicalArtifactState[] = [];

  for (const entry of status.artifacts) {
    const phaseName = DATA_PHASE_TO_PHASE_NAME[entry.phase];
    if (phaseName === undefined) {
      console.warn(`buildArtifactStates: unrecognized artifact phase "${entry.phase}" — skipping`);
      continue;
    }
    if (phaseName === 'summary') continue;

    // Coder change-summaries always belong to implementation,
    // even when produced during the review phase (fix cycles)
    const effectivePhase = entry.type === 'change-summary' && entry.role === 'coder' ? 'implementation' : phaseName;

    const artifactStatus = resolveArtifactStatus(effectivePhase, status);

    artifacts.push({
      id: `${entry.phase}:${entry.type}:${String(entry.iteration ?? 0)}`,
      label: entry.type,
      color: lookupArtifactColor(entry.type),
      status: artifactStatus,
      producerPhase: effectivePhase,
      ...(entry.iteration !== undefined && { iteration: entry.iteration }),
    });
  }

  return artifacts;
}

// endregion | Sub-function: artifact states

// -- Public mapper --

/**
 * Transform a `CanonicalRunStatus` snapshot into a `LogicalSceneState`
 * describing the logical workflow state of every entity, without spatial
 * assignment. Visualization adapters consume this to produce layout-specific
 * scene configurations.
 */
export function mapRunToLogicalScene(status: CanonicalRunStatus): LogicalSceneState {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const roster = deriveAgentRoster(status);

  const agents = buildAgentStates(roster, status, currentPhase);
  const orchestrator = buildOrchestratorState(status, currentPhase);
  const artifacts = buildArtifactStates(status);

  return {
    runStatus: status.status,
    currentPhase,
    agents,
    orchestrator,
    artifacts,
  };
}
