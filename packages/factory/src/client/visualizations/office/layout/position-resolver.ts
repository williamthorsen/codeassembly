import type { FacilityLayout, OfficeSceneConfig, Position, ResolvedPositions } from '../types.js';

/**
 * Resolve pixel-space positions for all entities in an OfficeSceneConfig
 * using the facility layout's spatial query methods.
 */
export function resolvePositions(config: OfficeSceneConfig, layout: FacilityLayout): ResolvedPositions {
  const agents = new Map<string, Position>();
  for (const agent of config.agents) {
    agents.set(agent.id, layout.slotPosition(agent.slotId));
  }

  const artifacts = new Map<string, Position>();
  for (const artifact of config.artifacts) {
    artifacts.set(artifact.id, layout.slotPosition(artifact.slotId));
  }

  const orchestrator = layout.zoneCenter(config.orchestrator.zoneId);

  return { agents, artifacts, orchestrator };
}
