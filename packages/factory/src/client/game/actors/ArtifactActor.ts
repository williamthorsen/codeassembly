import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export const ARTIFACT_COLORS: Record<string, string> = {
  architecture: PALETTE.blue,
  plan: PALETTE.green,
  code: PALETTE.yellow,
  review: PALETTE.red,
  simplifier: PALETTE.darkMagenta,
  holistic: PALETTE.darkCyan,
};

export class ArtifactActor extends Actor {
  constructor(type: string, position: Vector, size?: { width: number; height: number }) {
    const color = ARTIFACT_COLORS[type] ?? PALETTE.cyan;
    const { width, height } = size ?? { width: 15, height: 15 };
    super({
      pos: position,
      width,
      height,
      color: Color.fromHex(color),
    });
  }
}
