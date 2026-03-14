import type { FacilityLayout, ResolvedPosition, ResolvedPositions, TilemapSceneConfig } from '../types.js';
import { findSlotById } from './room-definitions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixel offset applied to artifact positions based on input/output side. */
export const ARTIFACT_SIDE_OFFSET = 8;

// ---------------------------------------------------------------------------
// Position resolver
// ---------------------------------------------------------------------------

/** Convert logical room/slot assignments into pixel coordinates. */
export function resolvePositions(config: TilemapSceneConfig, layout: FacilityLayout): ResolvedPositions {
  const orchestratorPos = layout.roomCenter(config.orchestrator.roomId);
  const orchestrator: ResolvedPosition = {
    entityId: 'orchestrator',
    x: orchestratorPos.x,
    y: orchestratorPos.y,
  };

  const agents: ResolvedPosition[] = config.agents.map((agent) => {
    const pos = layout.slotPosition(agent.slotId);
    const slotEntry = findSlotById(agent.slotId);
    const resolved: ResolvedPosition = {
      entityId: agent.id,
      x: pos.x,
      y: pos.y,
    };
    if (slotEntry !== undefined) {
      resolved.facing = slotEntry.slot.facing;
    }
    return resolved;
  });

  const artifacts: ResolvedPosition[] = config.artifacts.map((artifact) => {
    const pos = layout.slotPosition(artifact.slotId);
    const xOffset = artifact.side === 'input' ? -ARTIFACT_SIDE_OFFSET : ARTIFACT_SIDE_OFFSET;
    return {
      entityId: artifact.id,
      x: pos.x + xOffset,
      y: pos.y,
    };
  });

  return { orchestrator, agents, artifacts };
}
