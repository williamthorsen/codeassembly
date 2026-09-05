import type { LogicalSceneState } from '../../shared/types.ts';
import { ZONE_DEFINITIONS } from '../constants/zone-definitions.ts';
import type { OfficeAgentState, OfficeSceneConfig } from '../types.ts';
import {
  assignAgentToZone,
  buildArtifactStates,
  computeReviewerIndices,
  deriveOrchestratorAssignment,
  deriveZoneStates,
} from './agent-zone-assignments.ts';

/**
 * Transform a visualization-agnostic LogicalSceneState into an office-specific
 * OfficeSceneConfig with spatial zone and slot assignments.
 */
export function mapLogicalToOffice(logical: LogicalSceneState): OfficeSceneConfig {
  // Build reviewer index lookup for stable slot assignment
  const reviewerIndices = computeReviewerIndices(logical.agents);

  // Assign agents to zones and slots
  const agents: OfficeAgentState[] = logical.agents.map((agent) => {
    const slotIndex = reviewerIndices.get(agent.id) ?? 0;
    const assignment = assignAgentToZone(agent, slotIndex);

    return {
      id: agent.id,
      role: agent.role,
      roleType: agent.roleType,
      phase: agent.phase,
      status: agent.status,
      zoneId: assignment.zoneId,
      slotId: assignment.slotId,
    };
  });

  // Derive orchestrator zone and slot
  const orchestratorAssignment = deriveOrchestratorAssignment(logical.orchestrator, logical.currentPhase);

  const orchestrator = {
    status: logical.orchestrator.status,
    carriedArtifacts: logical.orchestrator.carriedArtifacts,
    codeBadge: logical.orchestrator.codeBadge,
    waiting: logical.orchestrator.waiting,
    zoneId: orchestratorAssignment.zoneId,
    slotId: orchestratorAssignment.slotId,
  };

  // Assign artifacts to zones
  const artifacts = buildArtifactStates(logical.artifacts);

  // Derive zone states from assigned agents
  const zones = deriveZoneStates(agents, ZONE_DEFINITIONS);

  return { orchestrator, agents, artifacts, zones };
}
