import { Actor, BaseAlign, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { ORCH_RADIUS } from '../constants/dimensions.js';

const ORCH_W = Math.round(ORCH_RADIUS * 2.2);
const ORCH_H = Math.round(ORCH_RADIUS * 1.6);
const ORCH_COLOR = '#FFD700';

export interface OrchestratorActorConfig {
  working: boolean;
}

export class OrchestratorActor extends Actor {
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
    this.graphics.opacity = config.working ? 1 : 0.8;
  }

  updateConfig(config: OrchestratorActorConfig): void {
    this.graphics.opacity = config.working ? 1 : 0.8;
  }
}
