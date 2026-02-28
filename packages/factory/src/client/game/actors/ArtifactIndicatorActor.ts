import { Actor, Color, vec } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';
import { ARTIFACT_COLORS } from './ArtifactActor.js';

export class ArtifactIndicatorActor extends Actor {
  constructor(type: string) {
    const color = ARTIFACT_COLORS[type] ?? PALETTE.cyan;
    super({
      pos: vec(0, -20),
      width: 8,
      height: 8,
      color: Color.fromHex(color),
    });
    this.graphics.isVisible = false;
  }

  show(): void {
    this.graphics.isVisible = true;
  }

  hide(): void {
    this.graphics.isVisible = false;
  }
}
