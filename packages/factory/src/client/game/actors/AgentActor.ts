import { Actor, type Vector } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import {
  getCelebratingAnimation,
  getConcernedAnimation,
  getIdleAnimation,
  getWalkingAnimation,
  getWorkingAnimation,
} from '../sprites/agent-sprite-loader.js';
import type { AgentAnimationState } from '../sprites/sprite-definitions.js';

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
    default: {
      // Exhaustive check: ensure all AgentAnimationState values are handled
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export class AgentActor extends Actor {
  readonly agentKey: string;
  private currentState: AgentAnimationState = 'idle';
  private isWalking = false;
  private pendingState: AgentAnimationState | undefined;
  private readonly roleType: RoleType;

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

  /** Move the actor to the target position, playing the walking animation during transit. */
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
}
