import { Actor, Color, type Vector } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import { ROLE_TYPE_COLORS } from '../../../shared/constants/role-types.js';

export class AgentActor extends Actor {
  constructor(roleType: RoleType, position: Vector) {
    const color = ROLE_TYPE_COLORS[roleType];
    super({
      pos: position,
      width: 20,
      height: 30,
      color: Color.fromHex(color),
    });
  }
}
