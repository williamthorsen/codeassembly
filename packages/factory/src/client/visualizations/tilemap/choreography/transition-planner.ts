import type { FacilityLayout, Position, ResolvedPositions, TilemapDiff, Transition, TransitionPlan } from '../types.js';

// ---------------------------------------------------------------------------
// Duration constants (milliseconds)
// ---------------------------------------------------------------------------

/** Duration for a walk transition (orchestrator moving between rooms). */
const WALK_DURATION_MS = 1200;

/** Duration for in-place state changes (idle → working, etc.). */
const STATE_CHANGE_DURATION_MS = 300;

/** Duration for fade in/out transitions. */
const FADE_DURATION_MS = 400;

/** Duration for artifact appear/deliver animations. */
const ARTIFACT_DURATION_MS = 500;

/** Stagger delay between sequential transitions to avoid simultaneous visual changes. */
const STAGGER_DELAY_MS = 150;

// ---------------------------------------------------------------------------
// Transition planner
// ---------------------------------------------------------------------------

/**
 * Convert a diff and resolved positions into a sequence of animation
 * instructions that the scene can execute.
 */
export function planTransitions(
  diff: TilemapDiff,
  prevPositions: ResolvedPositions,
  nextPositions: ResolvedPositions,
  layout: FacilityLayout,
): TransitionPlan {
  if (!diff.hasChanges) {
    return { transitions: [], totalDurationMs: 0 };
  }

  const transitions: Transition[] = [];
  let staggerIndex = 0;

  // --- Orchestrator walk ---
  if (diff.orchestrator.moved !== null) {
    const { fromRoom, toRoom } = diff.orchestrator.moved;
    const path = layout.corridorPath(fromRoom, toRoom);

    transitions.push({
      entityId: 'orchestrator',
      type: 'walk',
      from: { x: prevPositions.orchestrator.x, y: prevPositions.orchestrator.y },
      to: { x: nextPositions.orchestrator.x, y: nextPositions.orchestrator.y },
      path: [
        { x: prevPositions.orchestrator.x, y: prevPositions.orchestrator.y },
        ...path,
        { x: nextPositions.orchestrator.x, y: nextPositions.orchestrator.y },
      ],
      durationMs: WALK_DURATION_MS,
      delayMs: staggerIndex * STAGGER_DELAY_MS,
    });
    staggerIndex++;
  }

  // --- Orchestrator status change ---
  if (diff.orchestrator.statusChanged !== null) {
    transitions.push({
      entityId: 'orchestrator',
      type: 'state_change',
      to: { x: nextPositions.orchestrator.x, y: nextPositions.orchestrator.y },
      durationMs: STATE_CHANGE_DURATION_MS,
      delayMs: staggerIndex * STAGGER_DELAY_MS,
    });
    staggerIndex++;
  }

  // --- Agent transitions ---
  const prevAgentMap = new Map(prevPositions.agents.map((a) => [a.entityId, a]));

  for (const agentDiff of diff.agents) {
    const prevAgent = prevAgentMap.get(agentDiff.agentId);
    const nextAgent = nextPositions.agents.find((a) => a.entityId === agentDiff.agentId);

    if (nextAgent === undefined) continue;

    if (prevAgent === undefined) {
      // New agent — fade in
      transitions.push({
        entityId: agentDiff.agentId,
        type: 'fade_in',
        to: { x: nextAgent.x, y: nextAgent.y },
        durationMs: FADE_DURATION_MS,
        delayMs: staggerIndex * STAGGER_DELAY_MS,
      });
      staggerIndex++;
    } else if (agentDiff.statusChanged !== null) {
      // Status changed — in-place state change
      transitions.push({
        entityId: agentDiff.agentId,
        type: 'state_change',
        to: { x: nextAgent.x, y: nextAgent.y },
        durationMs: STATE_CHANGE_DURATION_MS,
        delayMs: staggerIndex * STAGGER_DELAY_MS,
      });
      staggerIndex++;
    }
  }

  // --- Artifact transitions ---
  for (const artifact of diff.artifacts.added) {
    const nextArt = nextPositions.artifacts.find((a) => a.entityId === artifact.id);
    if (nextArt === undefined) continue;

    transitions.push({
      entityId: artifact.id,
      type: 'artifact_appear',
      to: { x: nextArt.x, y: nextArt.y },
      durationMs: ARTIFACT_DURATION_MS,
      delayMs: staggerIndex * STAGGER_DELAY_MS,
    });
    staggerIndex++;
  }

  for (const change of diff.artifacts.statusChanged) {
    const nextArt = nextPositions.artifacts.find((a) => a.entityId === change.id);
    if (nextArt === undefined) continue;

    if (change.to === 'delivered') {
      transitions.push({
        entityId: change.id,
        type: 'artifact_deliver',
        to: { x: nextArt.x, y: nextArt.y },
        durationMs: ARTIFACT_DURATION_MS,
        delayMs: staggerIndex * STAGGER_DELAY_MS,
      });
      staggerIndex++;
    }
  }

  // Calculate total duration (last transition end time)
  let totalDurationMs = 0;
  for (const t of transitions) {
    const end = t.delayMs + t.durationMs;
    if (end > totalDurationMs) totalDurationMs = end;
  }

  return { transitions, totalDurationMs };
}
