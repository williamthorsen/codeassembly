import { Actor, BaseAlign, Color, Font, Text, vec, type Vector } from 'excalibur';

import { ACTIVE_OPACITY, IDLE_OPACITY } from '../constants/animation.ts';

export interface CatwalkStationActorConfig {
  phase: string;
  color: string;
  absent: boolean;
}

export class CatwalkStationActor extends Actor {
  constructor(config: CatwalkStationActorConfig, position: Vector) {
    super({ pos: position });

    const label = new Text({
      text: config.phase,
      color: Color.fromHex(config.color),
      font: new Font({
        size: 10,
        bold: true,
        family: 'monospace',
        baseAlign: BaseAlign.Top,
      }),
    });

    this.graphics.use(label);
    // Anchor (0.5, 0) centers the text horizontally on stationX, with top at the label y position.
    // Avoids the TextAlign.Center + default anchor double-centering bug.
    this.graphics.anchor = vec(0.5, 0);
    this.graphics.opacity = config.absent ? IDLE_OPACITY : ACTIVE_OPACITY;
  }

  updateConfig(config: CatwalkStationActorConfig): void {
    this.graphics.opacity = config.absent ? IDLE_OPACITY : ACTIVE_OPACITY;
  }
}
