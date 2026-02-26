import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export class GateActor extends Actor {
  constructor(open: boolean, position: Vector) {
    const color = open ? PALETTE.green : PALETTE.red;
    super({
      pos: position,
      width: 5,
      height: 40,
      color: Color.fromHex(color),
    });
  }
}
