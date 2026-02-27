import { Actor, type Vector } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import { getIdleAnimation, getWorkingAnimation } from '../sprites/agent-sprite-loader.js';
import type { AgentAnimationState } from '../sprites/sprite-definitions.js';

export class AgentActor extends Actor {
  private currentState: AgentAnimationState = 'idle';
  private readonly roleType: RoleType;

  constructor(roleType: RoleType, position: Vector) {
    super({
      pos: position,
      width: 32,
      height: 32,
    });

    this.roleType = roleType;
    const animation = getIdleAnimation(roleType);
    this.graphics.use(animation);
  }

  setAnimationState(state: AgentAnimationState): void {
    if (state === this.currentState) return;

    this.currentState = state;
    const animation = state === 'working' ? getWorkingAnimation(this.roleType) : getIdleAnimation(this.roleType);
    this.graphics.use(animation);
  }
}
