import { Actor, BaseAlign, Color, Font, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import {
  ACTIVE_OPACITY,
  ORCH_IDLE_OPACITY,
  PULSE_FREQUENCY,
  SCALE_PULSE_MAX,
  SCALE_PULSE_MIN,
} from '../constants/animation.js';
import { BADGE_OFFSET_Y, CARRIED_ART_GAP, CARRIED_ART_H, CARRIED_ART_W } from '../constants/dimensions.js';
import { WALK_SPEED } from '../constants/timing.js';
import { getAnimation } from '../sprites/catwalk-sprite-loader.js';
import type { CarriedArtifactConfig } from '../types.js';

export interface OrchestratorActorConfig {
  working: boolean;
}

/** Renders the orchestrator as an animated sprite on the catwalk rail, supporting walk and pulse animations. */
export class OrchestratorActor extends Actor {
  private _working = false;
  private _elapsed = 0;
  private _carriedChildren: Actor[] = [];
  private _badgeChild: Actor | undefined;

  constructor(config: OrchestratorActorConfig, position: Vector) {
    super({ pos: position });

    const animation = getAnimation('orchestrator', config.working ? 'working' : 'idle');
    this.graphics.use(animation);
    this._working = config.working;
    this.graphics.opacity = config.working ? ACTIVE_OPACITY : ORCH_IDLE_OPACITY;
  }

  /** Slide the orchestrator to a new position along the catwalk rail. Returns a promise that resolves when the walk completes. */
  animateMoveTo(pos: Vector): Promise<void> {
    return this.actions.moveTo(pos, WALK_SPEED).toPromise();
  }

  /** Toggle the pulsing working glow and switch sprite animation. */
  setWorking(working: boolean): void {
    this._working = working;
    const animation = getAnimation('orchestrator', working ? 'working' : 'idle');
    this.graphics.use(animation);
    this._elapsed = 0;
    if (working) {
      this.graphics.opacity = ACTIVE_OPACITY;
    } else {
      this.scale = vec(1, 1);
      this.graphics.opacity = ORCH_IDLE_OPACITY;
    }
  }

  /** Render small colored rectangles trailing the orchestrator horizontally on the rail. */
  setCarriedArtifacts(configs: CarriedArtifactConfig[]): void {
    // Remove previous carried artifact children
    for (const child of this._carriedChildren) {
      child.kill();
    }
    this._carriedChildren = [];

    // Add new carried artifact children, positioned relative to the orchestrator
    for (const [i, config] of configs.entries()) {
      const offsetX = -(i + 1) * (CARRIED_ART_W + CARRIED_ART_GAP);
      const child = new Actor({ pos: vec(offsetX, 0) });
      child.graphics.use(
        new Rectangle({
          width: CARRIED_ART_W,
          height: CARRIED_ART_H,
          color: Color.fromHex(config.color),
        }),
      );
      this.addChild(child);
      this._carriedChildren.push(child);
    }
  }

  /** Render a text badge below the orchestrator sprite. Pass null to hide. */
  setCodeBadge(config: { label: string; color: string } | null): void {
    // Remove previous badge child
    if (this._badgeChild !== undefined) {
      this._badgeChild.kill();
      this._badgeChild = undefined;
    }

    if (config === null) return;

    const badge = new Actor({ pos: vec(0, BADGE_OFFSET_Y) });
    badge.graphics.use(
      new Text({
        text: config.label,
        color: Color.fromHex(config.color),
        font: new Font({
          size: 9,
          bold: true,
          family: 'monospace',
          textAlign: TextAlign.Center,
          baseAlign: BaseAlign.Middle,
        }),
      }),
    );
    this.addChild(badge);
    this._badgeChild = badge;
  }

  override onPreUpdate(_engine: unknown, deltaMs: number): void {
    if (!this._working) return;
    this._elapsed += deltaMs;
    const t = Math.sin((this._elapsed * PULSE_FREQUENCY * Math.PI * 2) / 1000);
    const s = SCALE_PULSE_MIN + ((SCALE_PULSE_MAX - SCALE_PULSE_MIN) * (t + 1)) / 2;
    this.scale = vec(s, s);
  }
}
