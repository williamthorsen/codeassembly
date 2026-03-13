import { Actor, BaseAlign, Color, Font, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { ACTIVE_OPACITY, ORCH_IDLE_OPACITY } from '../constants/animation.js';
import {
  BADGE_OFFSET_Y,
  CARRIED_ART_GAP,
  CARRIED_ART_H,
  CARRIED_ART_W,
  ORCH_SPRITE_BOTTOM_PADDING_PX,
  SPRITE_SIZE,
} from '../constants/dimensions.js';
import { PAUSE_DURATION, WALK_SPEED } from '../constants/timing.js';
import { getAnimation } from '../sprites/catwalk-sprite-loader.js';
import type { CarriedArtifactConfig } from '../types.js';

export interface OrchestratorActorConfig {
  working: boolean;
}

/** Renders the orchestrator as an animated sprite on the catwalk rail, supporting walk and working animations. */
export class OrchestratorActor extends Actor {
  private _carriedChildren: Actor[] = [];
  private _badgeChild: Actor | undefined;

  constructor(config: OrchestratorActorConfig, position: Vector) {
    // Shift sprite up so the visible character bottom (not the transparent padding) sits on the rail.
    // Center anchor: offset = -SPRITE_SIZE/2 + ORCH_SPRITE_BOTTOM_PADDING_PX shifts the character down onto the rail.
    super({ pos: vec(position.x, position.y - SPRITE_SIZE / 2 + ORCH_SPRITE_BOTTOM_PADDING_PX) });

    const animation = getAnimation('orchestrator', config.working ? 'working' : 'idle');
    this.graphics.use(animation);
    this.graphics.opacity = config.working ? ACTIVE_OPACITY : ORCH_IDLE_OPACITY;
  }

  /** Slide the orchestrator to a new position along the catwalk rail. Returns a promise that resolves when the walk completes. */
  animateMoveTo(pos: Vector): Promise<void> {
    return this.actions
      .moveTo(vec(pos.x, pos.y - SPRITE_SIZE / 2 + ORCH_SPRITE_BOTTOM_PADDING_PX), WALK_SPEED)
      .toPromise();
  }

  /** Fade the orchestrator out to invisible and stop the working animation. */
  fadeOut(): void {
    this.actions.fade(0, PAUSE_DURATION);
  }

  /** Toggle the working animation and switch sprite animation. */
  setWorking(working: boolean): void {
    const animation = getAnimation('orchestrator', working ? 'working' : 'idle');
    this.graphics.use(animation);
    if (working) {
      this.graphics.opacity = ACTIVE_OPACITY;
    } else {
      this.scale = vec(1, 1);
      this.graphics.opacity = ORCH_IDLE_OPACITY;
    }
  }

  /** Switch to the celebrating sprite animation and stop the working animation. */
  celebrate(): void {
    this.scale = vec(1, 1);
    this.graphics.opacity = ACTIVE_OPACITY;
    const animation = getAnimation('orchestrator', 'celebrating');
    this.graphics.use(animation);
  }

  /** Render small colored rectangles trailing the orchestrator horizontally on the rail. */
  setCarriedArtifacts(configs: CarriedArtifactConfig[]): void {
    for (const child of this._carriedChildren) {
      child.kill();
    }
    this._carriedChildren = [];

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
}
