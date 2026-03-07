import { Actor, Color, Rectangle, vec, type Vector } from 'excalibur';

import { GATE_W, ORCH_RADIUS } from '../constants/dimensions.js';
import { PAUSE_DURATION } from '../constants/timing.js';

const ORCH_COLOR = '#FFD700';
const GATE_H = Math.round(ORCH_RADIUS * 1.6);

export interface GateActorConfig {
  open: boolean;
}

/** Renders a gate barrier between adjacent stations, supporting animated open transitions. */
export class GateActor extends Actor {
  constructor(config: GateActorConfig, position: Vector) {
    super({ pos: position });

    const rect = new Rectangle({
      width: GATE_W,
      height: GATE_H,
      color: Color.fromHex(ORCH_COLOR),
    });

    this.graphics.use(rect);
    this.graphics.opacity = 0.85;
    this.graphics.isVisible = !config.open;
  }

  updateConfig(config: GateActorConfig): void {
    this.graphics.isVisible = !config.open;
  }

  /** Animate the gate opening by scaling Y to zero over PAUSE_DURATION ms. */
  animateOpen(): void {
    const scaleSpeed = 1 / (PAUSE_DURATION / 1000);
    this.actions.scaleTo(vec(1, 0), vec(scaleSpeed, scaleSpeed));
  }
}
