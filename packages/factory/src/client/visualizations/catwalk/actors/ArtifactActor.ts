import { Actor, BaseAlign, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { ART_H, ART_W } from '../constants/dimensions.js';
import { PAUSE_DURATION } from '../constants/timing.js';

export interface ArtifactActorConfig {
  label: string;
  color: string;
}

/** Renders an artifact as a small colored rectangle with a label, supporting fade-in animation. */
export class ArtifactActor extends Actor {
  constructor(config: ArtifactActorConfig, position: Vector) {
    super({ pos: position });

    const rect = new Rectangle({
      width: ART_W,
      height: ART_H,
      color: Color.fromHex(config.color),
    });

    const label = new Text({
      text: config.label,
      color: Color.fromHex('#222222'),
      font: new Font({
        size: 8,
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
        { graphic: label, offset: vec(ART_W / 2, ART_H / 2), useBounds: false },
      ],
    });

    this.graphics.use(group);
  }

  /**
   * No-op for M1. Artifact appearance is fixed at construction.
   *
   * When reactive updates are wired up, this method should reconstruct the
   * graphics so label and color changes take effect.
   */
  updateConfig(_config: ArtifactActorConfig): void {
    // Intentionally empty.
  }

  /** Fade in from invisible. */
  fadeIn(): void {
    this.graphics.opacity = 0;
    this.actions.fade(1, PAUSE_DURATION);
  }
}
