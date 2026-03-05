import { Actor, Color, Rectangle, type Vector } from 'excalibur';

import { GATE_W, ORCH_RADIUS } from '../constants/dimensions.js';

const ORCH_COLOR = '#FFD700';
const GATE_H = Math.round(ORCH_RADIUS * 1.6);

export interface GateActorConfig {
  open: boolean;
}

export class GateActor extends Actor {
  constructor(config: GateActorConfig, position: Vector) {
    super({ pos: position });

    const rect = new Rectangle({
      width: GATE_W,
      height: GATE_H,
      color: Color.fromHex(ORCH_COLOR),
    });

    this.graphics.use(rect);
    this.graphics.opacity = config.open ? 0 : 0.85;
    this.graphics.isVisible = !config.open;
  }

  updateConfig(config: GateActorConfig): void {
    this.graphics.opacity = config.open ? 0 : 0.85;
    this.graphics.isVisible = !config.open;
  }
}
