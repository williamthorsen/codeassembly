import type { PhaseName } from '../../../../shared/constants/role-types.js';
import type {
  LogicalAgentState,
  LogicalArtifactState,
  LogicalOrchestratorState,
  OrchestratorStatus,
} from '../../shared/types.js';
import { GOVERNOR_ZONE } from '../constants/zone-definitions.js';
import type { OfficeAgentState, OfficeArtifactState, OfficeZoneState, ZoneDefinition } from '../types.js';

/** Number of storage slots in the governor zone, used for cycling delivered artifacts. */
const GOVERNOR_STORAGE_SLOT_COUNT = GOVERNOR_ZONE.slots.filter((s) => s.type === 'storage').length;

// -- Phase-to-zone mapping --

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

// -- Agent assignment --

/** Assign an agent to a zone and slot based on phase and role type. */
export function assignAgentToZone(agent: LogicalAgentState, agentIndex: number): { zoneId: string; slotId: string } {
  const zoneId = phaseToZoneId(agent.phase);

  if (zoneId === 'prep') {
    // Architect gets ws-0, planner gets ws-1
    const slotIndex = agent.phase === 'architecture' ? 0 : 1;
    return { zoneId, slotId: `prep-desk-${slotIndex}` };
  }

  if (zoneId === 'workshop') {
    // Coder gets ws-0, reviewers get ws-1 through ws-5
    if (agent.phase === 'implementation') {
      return { zoneId, slotId: 'workshop-desk-0' };
    }
    // Reviewers (review, simplifier, holistic) get ws-1 through ws-5
    // Cap at 5 reviewer slots
    const reviewerSlot = Math.min(agentIndex, 5);
    return { zoneId, slotId: `workshop-desk-${reviewerSlot}` };
  }

  // Governor zone fallback (summary phase agents)
  return { zoneId, slotId: ORCHESTRATOR_HOME_SLOT };
}

// -- Orchestrator assignment --

/** Zone IDs that the orchestrator can be assigned to. */
type OrchestratorZoneId = 'governor' | 'prep' | 'workshop';

/** Check whether a zone ID is one of the known orchestrator zones. */
function isOrchestratorZoneId(zoneId: string): zoneId is OrchestratorZoneId {
  return zoneId === 'governor' || zoneId === 'prep' || zoneId === 'workshop';
}

/** Orchestrator's home slot in the governor zone. */
const ORCHESTRATOR_HOME_SLOT = 'governor-desk-0';

/** Slot mapping from zone to the orchestrator's standing/home slot. */
const ORCHESTRATOR_SLOT_BY_ZONE: Record<OrchestratorZoneId, string> = {
  governor: ORCHESTRATOR_HOME_SLOT,
  prep: 'prep-standing-0',
  workshop: 'workshop-standing-0',
};

/** Derive the orchestrator's zone and slot from its status and the current phase. */
export function deriveOrchestratorAssignment(
  orchestrator: LogicalOrchestratorState,
  currentPhase: PhaseName | undefined,
): { zoneId: string; slotId: string } {
  const homeZone = 'governor';

  let zoneId: string;
  if (isOrchestratorAtHome(orchestrator.status)) {
    zoneId = homeZone;
  } else if (currentPhase === undefined) {
    zoneId = homeZone;
  } else {
    // When dispatching or monitoring, infer zone from current phase
    zoneId = phaseToZoneId(currentPhase);
  }

  const slotId = isOrchestratorZoneId(zoneId) ? ORCHESTRATOR_SLOT_BY_ZONE[zoneId] : undefined;

  if (slotId === undefined) {
    console.warn(`[office] Unknown orchestrator zone '${zoneId}'; falling back to ${ORCHESTRATOR_HOME_SLOT}`);
    return { zoneId, slotId: ORCHESTRATOR_HOME_SLOT };
  }

  return { zoneId, slotId };
}

/** Check whether the orchestrator status indicates it should be at its home zone. */
function isOrchestratorAtHome(status: OrchestratorStatus): boolean {
  return status === 'idle' || status === 'done' || status === 'delivering';
}

// -- Artifact assignment --

/** Assign an artifact to a zone and slot based on its status and producer phase. */
export function assignArtifactToZone(
  artifact: LogicalArtifactState,
  storageCounter: number,
): { zoneId: string; slotId: string } {
  if (artifact.status === 'delivered') {
    // Delivered artifacts go to governor storage slots (cycle through available slots)
    const storageSlotIndex = storageCounter % GOVERNOR_STORAGE_SLOT_COUNT;
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
      return 'prep-desk-0';
    case 'planning':
      return 'prep-desk-1';
    case 'implementation':
      return 'workshop-desk-0';
    case 'review':
    case 'simplifier':
    case 'holistic':
      return 'workshop-desk-1';
    case 'summary':
      return 'governor-desk-0';
  }
}

// -- Zone state derivation --

/** Derive aggregate zone states from the agents present in each zone. */
export function deriveZoneStates(agents: OfficeAgentState[], zones: readonly ZoneDefinition[]): OfficeZoneState[] {
  return zones.map((zone) => {
    const agentsInZone = agents.filter((a) => a.zoneId === zone.id);
    const active = agentsInZone.some((a) => a.status === 'working');
    const completed = agentsInZone.length > 0 && agentsInZone.every((a) => a.status === 'done');

    return { id: zone.id, active, completed };
  });
}

// -- Reviewer index computation --

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
      `[office] ${String(overflowCount)} reviewer(s) exceed available slots; they will share workshop-desk-${String(maxSlot)}`,
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
