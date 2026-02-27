import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export class PlatformActor extends Actor {
  constructor(position: Vector, width: number, height: number) {
    super({
      pos: position,
      width,
      height,
      color: Color.fromHex(PALETTE.darkGray),
    });
  }
}
