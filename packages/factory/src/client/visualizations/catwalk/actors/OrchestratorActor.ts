import { Actor, BaseAlign, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { ORCH_IDLE_OPACITY, ORCH_PULSE_MAX, ORCH_PULSE_MIN, PULSE_FREQUENCY } from '../constants/animation.js';
import { ORCH_RADIUS } from '../constants/dimensions.js';
import { WALK_SPEED } from '../constants/timing.js';

const ORCH_W = Math.round(ORCH_RADIUS * 2.2);
const ORCH_H = Math.round(ORCH_RADIUS * 1.6);
const ORCH_COLOR = '#FFD700';

export interface OrchestratorActorConfig {
  working: boolean;
}

/** Renders the orchestrator as a gold rectangle with label, supporting walk and pulse animations. */
export class OrchestratorActor extends Actor {
  private _working = false;
  private _elapsed = 0;

  constructor(config: OrchestratorActorConfig, position: Vector) {
    super({ pos: position });

    const rect = new Rectangle({
      width: ORCH_W,
      height: ORCH_H,
      color: Color.fromHex(ORCH_COLOR),
    });

    const label = new Text({
      text: 'ORCH',
      color: Color.fromHex('#111111'),
      font: new Font({
        size: 9,
        bold: true,
        family: 'monospace',
        textAlign: TextAlign.Center,
        baseAlign: BaseAlign.Middle,
      }),
    });

    const group = new GraphicsGroup({
      useAnchor: false,
      members: [
        { graphic: rect, offset: vec(0, 0) },
        { graphic: label, offset: vec(ORCH_W / 2, ORCH_H / 2), useBounds: false },
      ],
    });

    this.graphics.use(group);
    this._working = config.working;
    this.graphics.opacity = config.working ? ORCH_PULSE_MAX : ORCH_IDLE_OPACITY;
  }

  /** Slide the orchestrator to a new position along the catwalk rail. */
  animateMoveTo(pos: Vector): void {
    this.actions.moveTo(pos, WALK_SPEED);
  }

  /** Toggle the pulsing working glow. */
  setWorking(working: boolean): void {
    this._working = working;
    if (!working) {
      this._elapsed = 0;
      this.graphics.opacity = ORCH_IDLE_OPACITY;
    }
  }

  override onPreUpdate(_engine: unknown, deltaMs: number): void {
    if (!this._working) return;
    this._elapsed += deltaMs;
    const t = Math.sin((this._elapsed * PULSE_FREQUENCY * Math.PI * 2) / 1000);
    this.graphics.opacity = ORCH_PULSE_MIN + ((ORCH_PULSE_MAX - ORCH_PULSE_MIN) * (t + 1)) / 2;
  }
}
