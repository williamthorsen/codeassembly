import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const ARTIFACT_COLORS: Record<string, string> = {
  architecture: PALETTE.blue,
  plan: PALETTE.green,
  code: PALETTE.yellow,
  review: PALETTE.red,
};

export class ArtifactActor extends Actor {
  constructor(type: string, position: Vector) {
    const color = ARTIFACT_COLORS[type] ?? PALETTE.cyan;
    super({
      pos: position,
      width: 15,
      height: 15,
      color: Color.fromHex(color),
    });
  }
}
