import { TRANSITION_STAGGER_MS } from '../constants/dimensions.js';
import type { FacilityLayout, OfficeDiff, Position, ResolvedPositions, Transition, TransitionPlan } from '../types.js';

/**
 * Convert an OfficeDiff into an ordered list of transition instructions
 * with staggered timing. Walk transitions include corridor waypoints
 * when an entity moves between zones.
 */
export function planTransitions(
  diff: OfficeDiff,
  prevPositions: ResolvedPositions,
  nextPositions: ResolvedPositions,
  layout: FacilityLayout,
): TransitionPlan {
  const transitions: Transition[] = [];
  let staggerIndex = 0;

  // Orchestrator transitions
  if (diff.orchestrator.moved !== null) {
    const fromZone = diff.orchestrator.moved.from;
    const toZone = diff.orchestrator.moved.to;
    const waypoints = buildWalkWaypoints(
      prevPositions.orchestrator,
      nextPositions.orchestrator,
      fromZone,
      toZone,
      layout,
    );

    transitions.push({
      type: 'walk',
      entityId: 'orchestrator',
      entityKind: 'orchestrator',
      delayMs: staggerIndex * TRANSITION_STAGGER_MS,
      waypoints,
    });
    staggerIndex++;
  }

  if (diff.orchestrator.statusChanged !== null) {
    transitions.push({
      type: 'state_change',
      entityId: 'orchestrator',
      entityKind: 'orchestrator',
      delayMs: staggerIndex * TRANSITION_STAGGER_MS,
      from: diff.orchestrator.statusChanged.from,
      to: diff.orchestrator.statusChanged.to,
    });
    staggerIndex++;
  }

  // Agent transitions
  for (const agentDiff of diff.agents) {
    if (agentDiff.moved !== null) {
      const fromPos = prevPositions.agents.get(agentDiff.agentId);
      const toPos = nextPositions.agents.get(agentDiff.agentId);

      // New agent appearing (fromZone is empty)
      if (agentDiff.moved.fromZone === '') {
        if (toPos !== undefined) {
          transitions.push({
            type: 'fade_in',
            entityId: agentDiff.agentId,
            entityKind: 'agent',
            delayMs: staggerIndex * TRANSITION_STAGGER_MS,
            waypoints: [toPos],
          });
          staggerIndex++;
        }
        continue;
      }

      // Agent removed (toZone is empty)
      if (agentDiff.moved.toZone === '') {
        if (fromPos !== undefined) {
          transitions.push({
            type: 'fade_out',
            entityId: agentDiff.agentId,
            entityKind: 'agent',
            delayMs: staggerIndex * TRANSITION_STAGGER_MS,
            waypoints: [fromPos],
          });
          staggerIndex++;
        }
        continue;
      }

      // Agent moved between zones or slots
      if (fromPos !== undefined && toPos !== undefined) {
        const waypoints = buildWalkWaypoints(fromPos, toPos, agentDiff.moved.fromZone, agentDiff.moved.toZone, layout);
        transitions.push({
          type: 'walk',
          entityId: agentDiff.agentId,
          entityKind: 'agent',
          delayMs: staggerIndex * TRANSITION_STAGGER_MS,
          waypoints,
        });
        staggerIndex++;
      }
    }

    if (agentDiff.statusChanged !== null) {
      transitions.push({
        type: 'state_change',
        entityId: agentDiff.agentId,
        entityKind: 'agent',
        delayMs: staggerIndex * TRANSITION_STAGGER_MS,
        from: agentDiff.statusChanged.from,
        to: agentDiff.statusChanged.to,
      });
      staggerIndex++;
    }
  }

  // Artifact transitions
  for (const added of diff.artifacts.added) {
    const pos = nextPositions.artifacts.get(added.id);
    if (pos !== undefined) {
      transitions.push({
        type: 'artifact_appear',
        entityId: added.id,
        entityKind: 'artifact',
        delayMs: staggerIndex * TRANSITION_STAGGER_MS,
        waypoints: [pos],
      });
      staggerIndex++;
    }
  }

  for (const statusChange of diff.artifacts.statusChanged) {
    if (statusChange.to === 'delivered') {
      transitions.push({
        type: 'artifact_deliver',
        entityId: statusChange.artifactId,
        entityKind: 'artifact',
        delayMs: staggerIndex * TRANSITION_STAGGER_MS,
        from: statusChange.from,
        to: statusChange.to,
      });
      staggerIndex++;
    } else {
      transitions.push({
        type: 'state_change',
        entityId: statusChange.artifactId,
        entityKind: 'artifact',
        delayMs: staggerIndex * TRANSITION_STAGGER_MS,
        from: statusChange.from,
        to: statusChange.to,
      });
      staggerIndex++;
    }
  }

  for (const removed of diff.artifacts.removed) {
    const pos = prevPositions.artifacts.get(removed.id);
    if (pos !== undefined) {
      transitions.push({
        type: 'fade_out',
        entityId: removed.id,
        entityKind: 'artifact',
        delayMs: staggerIndex * TRANSITION_STAGGER_MS,
        waypoints: [pos],
      });
      staggerIndex++;
    }
  }

  return { transitions };
}

/**
 * Build walk waypoints including corridor path when moving between different zones,
 * or a direct path when moving within the same zone.
 */
function buildWalkWaypoints(
  from: Position,
  to: Position,
  fromZone: string,
  toZone: string,
  layout: FacilityLayout,
): Position[] {
  if (fromZone === toZone) {
    return [from, to];
  }

  // Cross-zone: go through corridor
  const corridor = layout.corridorPath(fromZone, toZone);
  return [from, ...corridor, to];
}
