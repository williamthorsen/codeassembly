import { Actor, vec, type Vector } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import type { Waypoint } from '../layout/walk-path.js';
import {
  getCelebratingAnimation,
  getConcernedAnimation,
  getIdleAnimation,
  getRestingAnimation,
  getWalkingAnimation,
  getWorkingAnimation,
} from '../sprites/agent-sprite-loader.js';
import type { AgentAnimationState } from '../sprites/sprite-definitions.js';
import { ArtifactIndicatorActor } from './ArtifactIndicatorActor.js';

export type FacingDirection = 'left' | 'right';

const WALK_SPEED = 100;

function getAnimationForState(state: AgentAnimationState, roleType: RoleType) {
  switch (state) {
    case 'idle':
      return getIdleAnimation(roleType);
    case 'walking':
      return getWalkingAnimation(roleType);
    case 'working':
      return getWorkingAnimation(roleType);
    case 'celebrating':
      return getCelebratingAnimation(roleType);
    case 'concerned':
      return getConcernedAnimation(roleType);
    case 'resting':
      return getRestingAnimation(roleType);
    default: {
      // Exhaustive check: ensure all AgentAnimationState values are handled
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Skip waypoints closer than 1px to avoid sub-pixel moveTo calls on same-position agents. */
const POSITION_TOLERANCE = 1;

export class AgentActor extends Actor {
  readonly agentKey: string;
  private artifactIndicator: ArtifactIndicatorActor | undefined;
  private currentState: AgentAnimationState = 'idle';
  private facing: FacingDirection = 'left';
  private isWalking = false;
  private pendingState: AgentAnimationState | undefined;
  private readonly roleType: RoleType;
  private _walkGeneration = 0;

  /** Monotonically increasing counter; incremented each time walkPath starts a new walk. */
  get walkGeneration(): number {
    return this._walkGeneration;
  }

  constructor(agentKey: string, roleType: RoleType, position: Vector) {
    super({
      pos: position,
      width: 32,
      height: 32,
    });

    this.agentKey = agentKey;
    this.roleType = roleType;
    const animation = getIdleAnimation(roleType);
    this.graphics.use(animation);
  }

  showArtifactIndicator(type: string): void {
    if (this.artifactIndicator !== undefined) {
      this.artifactIndicator.kill();
    }
    this.artifactIndicator = new ArtifactIndicatorActor(type);
    this.addChild(this.artifactIndicator);
    this.artifactIndicator.show();
  }

  hideArtifactIndicator(): void {
    this.artifactIndicator?.hide();
  }

  setFacing(direction: FacingDirection): void {
    if (direction === this.facing) return;
    this.facing = direction;
    this.graphics.flipHorizontal = direction === 'right';
  }

  setAnimationState(state: AgentAnimationState): void {
    if (this.isWalking) {
      this.pendingState = state;
      return;
    }
    if (state === this.currentState) return;

    this.currentState = state;
    this.graphics.use(getAnimationForState(state, this.roleType));
  }

  /** Consume and return the pending state, falling back to idle if none was set. */
  private resolvePendingState(): AgentAnimationState {
    const state = this.pendingState ?? 'idle';
    this.pendingState = undefined;
    return state;
  }

  /**
   * Move the actor to the target position, playing the walking animation during transit.
   * Prefer walkPath() for new code: it supports cancel-and-restart and multi-waypoint paths.
   */
  async walkTo(target: Vector): Promise<void> {
    if (this.isWalking) return;

    this.isWalking = true;
    this.pendingState = undefined;
    this.currentState = 'walking';
    this.graphics.use(getAnimationForState('walking', this.roleType));

    await this.actions.moveTo(target, WALK_SPEED).toPromise();

    this.isWalking = false;
    // pendingState may be set by setAnimationState() during the await above
    const restoreState = this.resolvePendingState();
    this.currentState = restoreState;
    this.graphics.use(getAnimationForState(restoreState, this.roleType));
  }

  /**
   * Walk through a sequence of waypoints with cancel-and-restart support.
   * If called while already walking, cancels the current walk and starts the new path.
   * Teleport waypoints snap position directly; walk waypoints use moveTo animation.
   */
  async walkPath(waypoints: ReadonlyArray<Waypoint>): Promise<void> {
    if (waypoints.length === 0) return;

    // Cancel any in-flight walk
    if (this.isWalking) {
      this.actions.clearActions();
    }

    this._walkGeneration += 1;
    const generation = this._walkGeneration;

    this.isWalking = true;
    this.pendingState = undefined;
    this.currentState = 'walking';
    this.graphics.use(getAnimationForState('walking', this.roleType));

    for (const waypoint of waypoints) {
      if (generation !== this._walkGeneration) return;

      if (waypoint.teleport) {
        this.pos = vec(waypoint.x, waypoint.y);
        continue;
      }

      // Skip zero-distance waypoints
      if (
        Math.abs(this.pos.x - waypoint.x) < POSITION_TOLERANCE &&
        Math.abs(this.pos.y - waypoint.y) < POSITION_TOLERANCE
      ) {
        continue;
      }

      await this.actions.moveTo(vec(waypoint.x, waypoint.y), WALK_SPEED).toPromise();

      if (generation !== this._walkGeneration) return;
    }

    this.isWalking = false;
    const restoreState = this.resolvePendingState();
    this.currentState = restoreState;
    this.graphics.use(getAnimationForState(restoreState, this.roleType));
  }
}
