import { Actor, vec, type Vector } from 'excalibur';

import { ORCH_IDLE_OPACITY, PULSE_FREQUENCY, SCALE_PULSE_MAX, SCALE_PULSE_MIN } from '../constants/animation.js';
import { WALK_SPEED } from '../constants/timing.js';
import { getAnimation } from '../sprites/catwalk-sprite-loader.js';

export interface OrchestratorActorConfig {
  working: boolean;
}

/** Renders the orchestrator as an animated sprite on the catwalk rail, supporting walk and pulse animations. */
export class OrchestratorActor extends Actor {
  private _working = false;
  private _elapsed = 0;

  constructor(config: OrchestratorActorConfig, position: Vector) {
    super({ pos: position });

    const animation = getAnimation('orchestrator', config.working ? 'working' : 'idle');
    this.graphics.use(animation);
    this._working = config.working;
    this.graphics.opacity = config.working ? 1 : ORCH_IDLE_OPACITY;
  }

  /** Slide the orchestrator to a new position along the catwalk rail. */
  animateMoveTo(pos: Vector): void {
    this.actions.moveTo(pos, WALK_SPEED);
  }

  /** Toggle the pulsing working glow and switch sprite animation. */
  setWorking(working: boolean): void {
    this._working = working;
    const animation = getAnimation('orchestrator', working ? 'working' : 'idle');
    this.graphics.use(animation);
    this._elapsed = 0;
    if (working) {
      this.graphics.opacity = 1;
    } else {
      this.scale = vec(1, 1);
      this.graphics.opacity = ORCH_IDLE_OPACITY;
    }
  }

  override onPreUpdate(_engine: unknown, deltaMs: number): void {
    if (!this._working) return;
    this._elapsed += deltaMs;
    const t = Math.sin((this._elapsed * PULSE_FREQUENCY * Math.PI * 2) / 1000);
    const s = SCALE_PULSE_MIN + ((SCALE_PULSE_MAX - SCALE_PULSE_MIN) * (t + 1)) / 2;
    this.scale = vec(s, s);
  }
}
