import { type Actor, vec } from 'excalibur';

import {
  ARTIFACT_APPEAR_SCALE_SPEED,
  ARTIFACT_DELIVER_SPEED_PX_PER_SEC,
  ARTIFACT_OVERSHOOT_SCALE,
  FADE_DURATION_MS,
  STATE_CHANGE_PULSE_HALF_MS,
  STATE_CHANGE_PULSE_OPACITY,
  WALK_SPEED_PX_PER_SEC,
} from '../constants/animation.js';
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP } from '../sprites/sprite-definitions.js';
import type {
  Direction,
  EntityKind,
  FacilityLayout,
  OfficeSceneConfig,
  Position,
  ResolvedPositions,
  Transition,
  TransitionPlan,
} from '../types.js';

// -- TransitionContext — the scene-provided callbacks the executor depends on --

/** Callback interface that decouples the executor from scene internals. */
export interface TransitionContext {
  config: OfficeSceneConfig;
  layout: FacilityLayout;
  nextPositions: ResolvedPositions;
  findActor(entityId: string, entityKind: EntityKind): Actor | undefined;
  createAgent(agentId: string, pos: Position, phase: string): Actor;
  createArtifact(artifactId: string, pos: Position, color: string): Actor;
  createOrchestrator(pos: Position): Actor;
  removeActor(entityId: string, entityKind: EntityKind): void;
  updateSprite(actor: Actor, entityId: string, entityKind: EntityKind, direction: number): void;
}

// -- AnimationHandle — returned to the caller for interrupt support --

/** Handle for cancelling all pending and in-progress transition animations. */
export interface AnimationHandle {
  cancel(): void;
}

// region | Direction helpers

/** Map a Direction string to a sprite-sheet column index. */
function directionToSpriteCol(direction: Direction): number {
  switch (direction) {
    case 'down':
      return DIR_DOWN;
    case 'left':
      return DIR_LEFT;
    case 'right':
      return DIR_RIGHT;
    case 'up':
      return DIR_UP;
  }
}

/** Compute the cardinal direction from one position to another. Dominant axis wins; ties favor vertical. */
export function computeDirection(from: Position, to: Position): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) {
    return DIR_DOWN;
  }

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? DIR_DOWN : DIR_UP;
  }
  return dx > 0 ? DIR_RIGHT : DIR_LEFT;
}

/** Resolve the resting direction for an entity at its assigned slot. */
function resolveRestingDirection(
  entityId: string,
  entityKind: EntityKind,
  config: OfficeSceneConfig,
  layout: FacilityLayout,
): number {
  let slotId: string | undefined;

  if (entityKind === 'orchestrator') {
    slotId = config.orchestrator.slotId;
  } else {
    const agent = config.agents.find((a) => a.id === entityId);
    if (agent === undefined) {
      return DIR_UP;
    }
    slotId = agent.slotId;
  }

  const slot = layout.slotDefinition(slotId);
  if (slot?.facing === undefined) {
    return entityKind === 'orchestrator' ? DIR_DOWN : DIR_UP;
  }

  return directionToSpriteCol(slot.facing);
}

// endregion | Direction helpers

// -- Transition handlers --

/** Schedule walk waypoints as chained moveTo actions with direction updates between segments. */
function handleWalk(transition: Transition, context: TransitionContext): void {
  const actor = context.findActor(transition.entityId, transition.entityKind);
  if (actor === undefined || transition.waypoints === undefined || transition.waypoints.length < 2) {
    return;
  }

  const waypoints = transition.waypoints;

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    if (from === undefined || to === undefined) continue;

    const direction = computeDirection(from, to);
    const entityId = transition.entityId;
    const entityKind = transition.entityKind;

    // Update sprite direction before each segment via callMethod
    actor.actions.callMethod(() => {
      context.updateSprite(actor, entityId, entityKind, direction);
    });

    actor.actions.moveTo(vec(to.x, to.y), WALK_SPEED_PX_PER_SEC);
  }

  // Set resting direction after walk completes
  const entityId = transition.entityId;
  const entityKind = transition.entityKind;

  actor.actions.callMethod(() => {
    const restingDirection = resolveRestingDirection(entityId, entityKind, context.config, context.layout);
    context.updateSprite(actor, entityId, entityKind, restingDirection);
  });
}

/**
 * Fade in: create actor at target position with opacity 0, then fade to 1.
 * Handles `agent` and `orchestrator` entity kinds only. Artifacts use `artifact_appear` instead.
 */
function handleFadeIn(transition: Transition, context: TransitionContext): void {
  const targetPos = transition.waypoints?.[0];
  if (targetPos === undefined) return;

  let actor: Actor | undefined;

  if (transition.entityKind === 'agent') {
    const agentState = context.config.agents.find((a) => a.id === transition.entityId);
    if (agentState === undefined) return;
    actor = context.createAgent(transition.entityId, targetPos, agentState.phase);
  } else if (transition.entityKind === 'orchestrator') {
    actor = context.createOrchestrator(targetPos);
  }

  if (actor === undefined) return;

  actor.graphics.opacity = 0;
  actor.actions.fade(1, FADE_DURATION_MS);
}

/** Fade out: fade to 0 then remove actor. */
function handleFadeOut(transition: Transition, context: TransitionContext): void {
  const actor = context.findActor(transition.entityId, transition.entityKind);
  if (actor === undefined) return;

  const entityId = transition.entityId;
  const entityKind = transition.entityKind;

  actor.actions.fade(0, FADE_DURATION_MS);
  actor.actions.callMethod(() => {
    context.removeActor(entityId, entityKind);
  });
}

/** State change: quick dim-and-restore pulse. */
function handleStateChange(transition: Transition, context: TransitionContext): void {
  const actor = context.findActor(transition.entityId, transition.entityKind);
  if (actor === undefined) return;

  actor.actions.fade(STATE_CHANGE_PULSE_OPACITY, STATE_CHANGE_PULSE_HALF_MS);
  actor.actions.fade(1, STATE_CHANGE_PULSE_HALF_MS);
}

/** Artifact appear: create at target position with scale 0, overshoot then settle. */
function handleArtifactAppear(transition: Transition, context: TransitionContext): void {
  const targetPos = transition.waypoints?.[0];
  if (targetPos === undefined) return;

  const artifactState = context.config.artifacts.find((a) => a.id === transition.entityId);
  if (artifactState === undefined) return;

  const actor = context.createArtifact(transition.entityId, targetPos, artifactState.color);
  actor.scale = vec(0, 0);

  const speed = ARTIFACT_APPEAR_SCALE_SPEED;
  actor.actions.scaleTo(vec(ARTIFACT_OVERSHOOT_SCALE, ARTIFACT_OVERSHOOT_SCALE), vec(speed, speed));
  actor.actions.scaleTo(vec(1, 1), vec(speed, speed));
}

/** Artifact deliver: slide to the delivery position from nextPositions. */
function handleArtifactDeliver(transition: Transition, context: TransitionContext): void {
  const actor = context.findActor(transition.entityId, transition.entityKind);
  if (actor === undefined) return;

  const targetPos = context.nextPositions.artifacts.get(transition.entityId);
  if (targetPos === undefined) return;

  actor.actions.moveTo(vec(targetPos.x, targetPos.y), ARTIFACT_DELIVER_SPEED_PX_PER_SEC);
}

// -- Dispatcher --

/** Dispatch a transition to the appropriate handler. */
function dispatchTransition(transition: Transition, context: TransitionContext): void {
  switch (transition.type) {
    case 'walk':
      handleWalk(transition, context);
      break;
    case 'fade_in':
      handleFadeIn(transition, context);
      break;
    case 'fade_out':
      handleFadeOut(transition, context);
      break;
    case 'state_change':
      handleStateChange(transition, context);
      break;
    case 'artifact_appear':
      handleArtifactAppear(transition, context);
      break;
    case 'artifact_deliver':
      handleArtifactDeliver(transition, context);
      break;
  }
}

// -- Public API --

/**
 * Execute a transition plan by scheduling each transition with its delay
 * and dispatching to the appropriate handler. Returns a handle for cancellation.
 */
export function executeTransitions(plan: TransitionPlan, context: TransitionContext): AnimationHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const touchedActors = new Set<Actor>();

  /** Clear all pending timers and in-progress actor actions. */
  function cancelAll(): void {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    for (const actor of touchedActors) {
      actor.actions.clearActions();
    }
    timers.length = 0;
    touchedActors.clear();
  }

  for (const transition of plan.transitions) {
    const timer = setTimeout(() => {
      try {
        dispatchTransition(transition, context);
      } catch (error) {
        console.error('[transition-executor] dispatchTransition failed:', error);
        cancelAll();
        return;
      }

      // Track actors that received actions for cancel support
      const actor = context.findActor(transition.entityId, transition.entityKind);
      if (actor !== undefined) {
        touchedActors.add(actor);
      }
    }, transition.delayMs);

    timers.push(timer);
  }

  return { cancel: cancelAll };
}
