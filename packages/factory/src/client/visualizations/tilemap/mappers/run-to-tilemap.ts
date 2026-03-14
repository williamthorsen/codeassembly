import type { PhaseName } from '../../../../shared/constants/role-types.js';
import { PHASE_NAMES } from '../../../../shared/constants/role-types.js';
import { findCurrentPhase, isPhasePresentInData } from '../../../../shared/phase-inference.js';
import type { CanonicalRunStatus } from '../../../../shared/types/canonical.js';
import { type AgentAnimationState, resolveAgentState } from '../../shared/agent-state-resolver.js';
import { isPresent, lookupArtifactColor, PHASE_AGENT_ID } from '../../shared/artifact-utils.js';
import { buildCarriedArtifacts, buildCodeBadge } from '../../shared/orchestrator-utils.js';
import type {
  AgentStatus,
  OrchestratorStatus,
  TilemapAgentState,
  TilemapArtifactState,
  TilemapOrchestratorState,
  TilemapRoomState,
  TilemapSceneConfig,
} from '../types.js';
import { type AgentAssignment, deriveAgentAssignments, deriveOrchestratorRoom } from './agent-assignments.js';
import { mapRunToThoughtBubbles } from './run-to-thought-bubbles.js';

// ---------------------------------------------------------------------------
// Agent ID ↔ phase mapping
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
// Data-model phase name → visualization PhaseName
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
// All facility room IDs
// ---------------------------------------------------------------------------

const ALL_ROOM_IDS = ['analysis', 'control', 'workshop', 'review-bay', 'delivery'] as const;

// ---------------------------------------------------------------------------
// Sub-function A: room states
// ---------------------------------------------------------------------------

function buildRoomStates(
  assignments: AgentAssignment[],
  currentPhase: PhaseName | undefined,
  status: CanonicalRunStatus,
): TilemapRoomState[] {
  // Group assignments by room
  const roomAgents = new Map<string, AgentAssignment[]>();
  for (const a of assignments) {
    const list = roomAgents.get(a.roomId);
    if (list === undefined) {
      roomAgents.set(a.roomId, [a]);
    } else {
      list.push(a);
    }
  }

  return ALL_ROOM_IDS.map((roomId) => {
    const agents = roomAgents.get(roomId) ?? [];

    const active = agents.some((a) => {
      const phase = agentIdToPhase(a.agentId);
      if (phase === undefined) return false;
      const state = resolveAgentState(phase, status, currentPhase);
      return state === 'working';
    });

    const completed =
      agents.length > 0 &&
      agents.every((a) => {
        const phase = agentIdToPhase(a.agentId);
        if (phase === undefined) return false;
        const state = resolveAgentState(phase, status, currentPhase);
        return state === 'resting' || state === 'celebrating';
      });

    const hasAlerts = agents.some((a) => {
      const phase = agentIdToPhase(a.agentId);
      if (phase === undefined) return false;
      const state = resolveAgentState(phase, status, currentPhase);
      return state === 'concerned';
    });

    return { id: roomId, active, completed, hasAlerts };
  });
}

// ---------------------------------------------------------------------------
// Sub-function B: orchestrator state
// ---------------------------------------------------------------------------

function buildOrchestratorState(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): TilemapOrchestratorState {
  const roomId = deriveOrchestratorRoom(currentPhase, status.status);

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

  // Reuse shared utils for carried artifacts and code badge
  const stationIndex =
    currentPhase === undefined ? (status.status === 'completed' ? 6 : -1) : PHASE_NAMES.indexOf(currentPhase);
  const working = currentPhase !== undefined && !isPhasePresentInData(currentPhase, status.phases);

  const carriedArtifacts = buildCarriedArtifacts(status, stationIndex, working);
  const codeBadge = buildCodeBadge(status);

  const waiting = isPresent(status.waitingForInput) && status.status === 'in_progress';

  return { roomId, status: orchStatus, carriedArtifacts, codeBadge, waiting };
}

// ---------------------------------------------------------------------------
// Sub-function C: agent states
// ---------------------------------------------------------------------------

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

function buildAgentStates(
  assignments: AgentAssignment[],
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): TilemapAgentState[] {
  return assignments.map((assignment) => {
    const phase = agentIdToPhase(assignment.agentId);
    const animState = phase === undefined ? 'idle' : resolveAgentState(phase, status, currentPhase);

    return {
      id: assignment.agentId,
      role: assignment.role,
      roleType: assignment.roleType,
      status: mapAnimationToAgentStatus(animState),
      roomId: assignment.roomId,
      slotId: assignment.slotId,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-function D: artifact states
// ---------------------------------------------------------------------------

function resolveArtifactAssignment(
  phase: PhaseName,
  agentName: string,
  assignments: AgentAssignment[],
  reviewerByName: Map<string, AgentAssignment>,
): AgentAssignment | undefined {
  if (phase === 'review') {
    return reviewerByName.get(agentName) ?? assignments.find((a) => a.agentId === 'reviewer-0');
  }

  const agentId = PHASE_AGENT_ID[phase];
  if (agentId === undefined) return undefined;
  return assignments.find((a) => a.agentId === agentId);
}

function buildArtifactStates(status: CanonicalRunStatus, assignments: AgentAssignment[]): TilemapArtifactState[] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  // Build reviewer name → assignment lookup
  const reviewerByName = new Map<string, AgentAssignment>();
  for (const a of assignments) {
    if (a.agentId.startsWith('reviewer-')) {
      reviewerByName.set(a.role, a);
    }
  }

  const artifacts: TilemapArtifactState[] = [];

  for (const entry of status.artifacts) {
    const phaseName = ARTIFACT_PHASE_MAP[entry.phase];
    if (phaseName === undefined || phaseName === 'summary') continue;

    // Coder change-summaries always belong to implementation,
    // even when produced during the review phase (fix cycles)
    const effectivePhase = entry.type === 'change-summary' && entry.role === 'coder' ? 'implementation' : phaseName;

    const assignment = resolveArtifactAssignment(effectivePhase, entry.agent, assignments, reviewerByName);
    if (assignment === undefined) continue;

    artifacts.push({
      id: `${entry.phase}:${entry.type}:${String(entry.iteration ?? 0)}`,
      label: entry.type,
      color: lookupArtifactColor(entry.type),
      status: 'on_desk',
      roomId: assignment.roomId,
      slotId: assignment.slotId,
      side: 'output',
      ...(entry.iteration === undefined ? {} : { version: entry.iteration }),
    });
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

/**
 * Transform a `CanonicalRunStatus` snapshot into a complete `TilemapSceneConfig`
 * describing the logical state of every entity in the facility.
 *
 * This is a pure function — no pixel positions, no rendering.
 * The position resolver (Layer 3) converts room/slot IDs to pixel coordinates.
 */
export function mapRunToTilemap(status: CanonicalRunStatus): TilemapSceneConfig {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const assignments = deriveAgentAssignments(status);

  const rooms = buildRoomStates(assignments, currentPhase, status);
  const orchestrator = buildOrchestratorState(status, currentPhase);
  const agents = buildAgentStates(assignments, status, currentPhase);
  const artifacts = buildArtifactStates(status, assignments);
  const thoughtBubbles = mapRunToThoughtBubbles(status);

  return { rooms, orchestrator, agents, artifacts, thoughtBubbles };
}
