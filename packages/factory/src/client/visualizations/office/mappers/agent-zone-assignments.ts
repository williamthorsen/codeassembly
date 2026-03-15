import type { PhaseName } from '../../../../shared/constants/role-types.js';
import type {
  LogicalAgentState,
  LogicalArtifactState,
  LogicalOrchestratorState,
  OrchestratorStatus,
} from '../../shared/types.js';
import type { OfficeAgentState, OfficeArtifactState, OfficeZoneState, ZoneDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// Phase-to-zone mapping
// ---------------------------------------------------------------------------

/** Map a phase to its office zone. */
function phaseToZoneId(phase: PhaseName): string {
  switch (phase) {
    case 'architecture':
    case 'planning':
      return 'prep';
    case 'implementation':
    case 'review':
    case 'simplifier':
    case 'holistic':
      return 'workshop';
    case 'summary':
      return 'governor';
  }
}

// ---------------------------------------------------------------------------
// Agent assignment
// ---------------------------------------------------------------------------

/** Assign an agent to a zone and slot based on phase and role type. */
export function assignAgentToZone(agent: LogicalAgentState, agentIndex: number): { zoneId: string; slotId: string } {
  const zoneId = phaseToZoneId(agent.phase);

  if (zoneId === 'prep') {
    // Architect gets ws-0, planner gets ws-1
    const slotIndex = agent.phase === 'architecture' ? 0 : 1;
    return { zoneId, slotId: `prep-ws-${slotIndex}` };
  }

  if (zoneId === 'workshop') {
    // Coder gets ws-0, reviewers get ws-1 through ws-5
    if (agent.phase === 'implementation') {
      return { zoneId, slotId: 'workshop-ws-0' };
    }
    // Reviewers (review, simplifier, holistic) get ws-1 through ws-5
    // Cap at 5 reviewer slots
    const reviewerSlot = Math.min(agentIndex, 5);
    return { zoneId, slotId: `workshop-ws-${reviewerSlot}` };
  }

  // Governor zone fallback (summary phase agents)
  return { zoneId, slotId: 'governor-desk-0' };
}

// ---------------------------------------------------------------------------
// Orchestrator zone
// ---------------------------------------------------------------------------

/** Derive the orchestrator's zone from its status and the current phase. */
export function deriveOrchestratorZone(
  orchestrator: LogicalOrchestratorState,
  currentPhase: PhaseName | undefined,
): string {
  const homeZone = 'governor';

  if (isOrchestratorAtHome(orchestrator.status)) {
    return homeZone;
  }

  // When dispatching or monitoring, infer zone from current phase
  if (currentPhase !== undefined) {
    return phaseToZoneId(currentPhase);
  }

  return homeZone;
}

/** Check whether the orchestrator status indicates it should be at its home zone. */
function isOrchestratorAtHome(status: OrchestratorStatus): boolean {
  return status === 'idle' || status === 'done' || status === 'delivering';
}

// ---------------------------------------------------------------------------
// Artifact assignment
// ---------------------------------------------------------------------------

/** Assign an artifact to a zone and slot based on its status and producer phase. */
export function assignArtifactToZone(
  artifact: LogicalArtifactState,
  storageCounter: number,
): { zoneId: string; slotId: string } {
  if (artifact.status === 'delivered') {
    // Delivered artifacts go to governor storage slots (cycle through available slots)
    const storageSlotIndex = storageCounter % 3;
    return { zoneId: 'governor', slotId: `governor-storage-${storageSlotIndex}` };
  }

  // Created and in_transit artifacts stay at their producer's zone
  const zoneId = phaseToZoneId(artifact.producerPhase);
  const producerSlotId = resolveProducerSlot(artifact.producerPhase);
  return { zoneId, slotId: producerSlotId };
}

/** Resolve the slot ID for the primary producer of a phase. */
function resolveProducerSlot(phase: PhaseName): string {
  switch (phase) {
    case 'architecture':
      return 'prep-ws-0';
    case 'planning':
      return 'prep-ws-1';
    case 'implementation':
      return 'workshop-ws-0';
    case 'review':
    case 'simplifier':
    case 'holistic':
      return 'workshop-ws-1';
    case 'summary':
      return 'governor-desk-0';
  }
}

// ---------------------------------------------------------------------------
// Zone state derivation
// ---------------------------------------------------------------------------

/** Derive aggregate zone states from the agents present in each zone. */
export function deriveZoneStates(agents: OfficeAgentState[], zones: readonly ZoneDefinition[]): OfficeZoneState[] {
  return zones.map((zone) => {
    const agentsInZone = agents.filter((a) => a.zoneId === zone.id);

    // No agents: neither active nor completed
    if (agentsInZone.length === 0) {
      return { id: zone.id, active: false, completed: false };
    }

    const active = agentsInZone.some((a) => a.status === 'working');
    const completed = agentsInZone.every((a) => a.status === 'done');

    return { id: zone.id, active, completed };
  });
}

// ---------------------------------------------------------------------------
// Reviewer index computation
// ---------------------------------------------------------------------------

/** Compute stable reviewer slot indices by sorting review-phase agents by ID. */
export function computeReviewerIndices(agents: LogicalAgentState[]): Map<string, number> {
  const reviewAgents = agents
    .filter((a) => a.phase === 'review' || a.phase === 'simplifier' || a.phase === 'holistic')
    .toSorted((a, b) => a.id.localeCompare(b.id));

  const maxSlot = 5;
  const indices = new Map<string, number>();
  for (const [i, agent] of reviewAgents.entries()) {
    // Reviewer slots start at ws-1, cap at ws-5
    indices.set(agent.id, Math.min(i + 1, maxSlot));
  }

  const overflowCount = reviewAgents.length - maxSlot;
  if (overflowCount > 0) {
    console.warn(
      `[office] ${String(overflowCount)} reviewer(s) exceed available slots; they will share workshop-ws-${String(maxSlot)}`,
    );
  }

  return indices;
}

/** Build a complete artifact assignment producing OfficeArtifactState values. */
export function buildArtifactStates(artifacts: LogicalArtifactState[]): OfficeArtifactState[] {
  let storageCounter = 0;

  return artifacts.map((artifact) => {
    const assignment = assignArtifactToZone(artifact, storageCounter);
    if (artifact.status === 'delivered') {
      storageCounter++;
    }

    return {
      id: artifact.id,
      label: artifact.label,
      color: artifact.color,
      status: artifact.status,
      producerPhase: artifact.producerPhase,
      zoneId: assignment.zoneId,
      slotId: assignment.slotId,
    };
  });
}
