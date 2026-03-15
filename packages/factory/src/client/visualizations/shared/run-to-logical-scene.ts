import type { PhaseName } from '../../../shared/constants/role-types.js';
import { findCurrentPhase, isPhasePresentInData } from '../../../shared/phase-inference.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { type AgentAnimationState, resolveAgentState } from './agent-state-resolver.js';
import { isPresent, lookupArtifactColor } from './artifact-utils.js';
import { type AgentRosterEntry, deriveAgentRoster } from './derive-agent-roster.js';
import { buildCarriedArtifacts, buildCodeBadge } from './orchestrator-utils.js';
import type {
  AgentStatus,
  ArtifactStatus,
  LogicalAgentState,
  LogicalArtifactState,
  LogicalOrchestratorState,
  LogicalSceneState,
  OrchestratorStatus,
} from './types.js';

// ---------------------------------------------------------------------------
// Data-model phase name to PhaseName normalization
// ---------------------------------------------------------------------------

const ARTIFACT_PHASE_MAP: Record<string, PhaseName> = {
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
// Agent ID to phase mapping
// ---------------------------------------------------------------------------

const AGENT_ID_TO_PHASE: Record<string, PhaseName> = {
  arch: 'architecture',
  plan: 'planning',
  coder: 'implementation',
  simp: 'simplifier',
  holi: 'holistic',
};

function agentIdToPhase(agentId: string): PhaseName | undefined {
  if (agentId.startsWith('reviewer-')) return 'review';
  return AGENT_ID_TO_PHASE[agentId];
}

// ---------------------------------------------------------------------------
// Animation state to agent status mapping
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-function: agent states
// ---------------------------------------------------------------------------

/** Build logical agent states from the roster and run status. */
function buildAgentStates(
  roster: AgentRosterEntry[],
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): LogicalAgentState[] {
  return roster.map((entry) => {
    const phase = agentIdToPhase(entry.agentId) ?? entry.phase;
    const animState = resolveAgentState(phase, status, currentPhase);

    return {
      id: entry.agentId,
      role: entry.role,
      roleType: entry.roleType,
      phase: entry.phase,
      status: mapAnimationToAgentStatus(animState),
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-function: orchestrator state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-function: artifact states
// ---------------------------------------------------------------------------

/**
 * Determine the artifact lifecycle status based on whether the producing
 * phase has completed.
 */
function resolveArtifactStatus(producerPhase: PhaseName, status: CanonicalRunStatus): ArtifactStatus {
  if (status.status === 'completed') return 'delivered';

  // Check if the phase that produced this artifact has been evaluated
  const phases = status.phases;
  switch (producerPhase) {
    case 'architecture':
      return isPresent(phases.architecture) && phases.architecture.status === 'completed' ? 'delivered' : 'created';
    case 'planning':
      return isPresent(phases.planning) && phases.planning.status === 'completed' ? 'delivered' : 'created';
    case 'implementation':
      return isPresent(phases.implementation) && phases.implementation.status === 'completed' ? 'delivered' : 'created';
    case 'review':
      return isPresent(phases.parallelReview ?? phases.review) ? 'delivered' : 'created';
    case 'simplifier':
      return phases.codeSimplifier?.ran === true ? 'delivered' : 'created';
    case 'holistic':
      return isPresent(phases.holisticReview) && phases.holisticReview.status === 'completed' ? 'delivered' : 'created';
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
    const phaseName = ARTIFACT_PHASE_MAP[entry.phase];
    if (phaseName === undefined || phaseName === 'summary') continue;

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
      ...(entry.iteration === undefined ? {} : { iteration: entry.iteration }),
    });
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

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
