import { Actor, BaseAlign, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { ART_H, ART_W } from '../constants/dimensions.ts';
import { CHUTE_DURATION } from '../constants/timing.ts';
import type { ChuteEndpoints } from '../layout/catwalk-layout.ts';

export interface FlyingArtifactConfig {
  label: string;
  color: string;
}

/**
 * Temporary actor that animates along a vertical chute path and self-removes on completion.
 * Used for artifact pick-up (ascend) and drop-off (descend) animations.
 */
export class FlyingArtifactActor extends Actor {
  private readonly endpoints: ChuteEndpoints;

  constructor(config: FlyingArtifactConfig, endpoints: ChuteEndpoints, direction: 'ascend' | 'descend') {
    const startPos: Vector =
      direction === 'ascend' ? vec(endpoints.botX, endpoints.botY) : vec(endpoints.topX, endpoints.topY);

    super({ pos: startPos });
    this.endpoints = endpoints;

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

  /** Move from bottom to top of the chute, then self-remove. */
  async ascend(): Promise<void> {
    const target = vec(this.endpoints.topX, this.endpoints.topY);
    await this.actions.moveTo(target, this.computeSpeed()).toPromise();
    this.kill();
  }

  /** Move from top to bottom of the chute, then self-remove. */
  async descend(): Promise<void> {
    const target = vec(this.endpoints.botX, this.endpoints.botY);
    await this.actions.moveTo(target, this.computeSpeed()).toPromise();
    this.kill();
  }

  /** Derive speed from chute height and configured duration. */
  private computeSpeed(): number {
    const distance = Math.abs(this.endpoints.botY - this.endpoints.topY);
    return (distance / CHUTE_DURATION) * 1_000;
  }
}
