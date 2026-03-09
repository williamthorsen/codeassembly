import { Actor, BaseAlign, Color, Font, Text, TextAlign, type Vector } from 'excalibur';

import { ACTIVE_OPACITY, IDLE_OPACITY } from '../constants/animation.js';

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
        textAlign: TextAlign.Center,
        baseAlign: BaseAlign.Top,
      }),
    });

    this.graphics.use(label);
    this.graphics.opacity = config.absent ? IDLE_OPACITY : ACTIVE_OPACITY;
  }

  updateConfig(config: CatwalkStationActorConfig): void {
    this.graphics.opacity = config.absent ? IDLE_OPACITY : ACTIVE_OPACITY;
  }
}
