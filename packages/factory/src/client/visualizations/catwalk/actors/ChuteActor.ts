import { Actor, Color, Rectangle, vec } from 'excalibur';

import type { ChuteEndpoints } from '../layout/catwalk-layout.js';

export interface ChuteActorConfig {
  dimmed: boolean;
}

export class ChuteActor extends Actor {
  constructor(config: ChuteActorConfig, endpoints: ChuteEndpoints) {
    const height = endpoints.botY - endpoints.topY;

    super({
      pos: vec(endpoints.topX, endpoints.topY + height / 2),
    });

    const rect = new Rectangle({
      width: 1,
      height,
      color: Color.fromHex('#333333'),
    });

    this.graphics.use(rect);
    this.graphics.opacity = config.dimmed ? 0.15 : 0.5;
  }

  updateConfig(config: ChuteActorConfig): void {
    this.graphics.opacity = config.dimmed ? 0.15 : 0.5;
  }
}
