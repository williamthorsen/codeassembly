import { Actor, Color, Font, Text, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export class StationActor extends Actor {
  constructor(phase: string, active: boolean, position: Vector) {
    const color = active ? PALETTE.lightGray : PALETTE.darkGray;
    super({
      pos: position,
      width: 100,
      height: 60,
      color: Color.fromHex(color),
    });

    const label = new Text({
      text: phase,
      color: Color.fromHex(PALETTE.white),
      font: new Font({ size: 10 }),
    });
    this.graphics.add(label);
  }
}
