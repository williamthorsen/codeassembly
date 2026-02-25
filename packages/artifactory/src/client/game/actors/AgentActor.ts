import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const ROLE_COLORS: Record<string, string> = {
  architect: PALETTE.blue,
  planner: PALETTE.green,
  coder: PALETTE.yellow,
  reviewer: PALETTE.red,
};

export class AgentActor extends Actor {
  constructor(role: string, position: Vector) {
    const color = ROLE_COLORS[role] ?? PALETTE.white;
    super({
      pos: position,
      width: 20,
      height: 30,
      color: Color.fromHex(color),
    });
  }
}
