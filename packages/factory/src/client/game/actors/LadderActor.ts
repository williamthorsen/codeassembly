import { Actor, Color, GraphicsGroup, type GraphicsGrouping, Rectangle, vec } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const RAIL_WIDTH = 2;
const RUNG_HEIGHT = 2;
const RUNG_SPACING = 12;
const LADDER_WIDTH = 16;

export class LadderActor extends Actor {
  constructor(x: number, bottomY: number, topY: number) {
    const height = bottomY - topY;

    super({
      pos: vec(x, topY),
      width: LADDER_WIDTH,
      height,
    });

    const color = Color.fromHex(PALETTE.brown);

    const leftRail = new Rectangle({
      width: RAIL_WIDTH,
      height,
      color,
    });

    const rightRail = new Rectangle({
      width: RAIL_WIDTH,
      height,
      color,
    });

    const members: GraphicsGrouping[] = [
      { graphic: leftRail, offset: vec(0, 0) },
      { graphic: rightRail, offset: vec(LADDER_WIDTH - RAIL_WIDTH, 0) },
    ];

    const rungCount = Math.max(1, Math.floor(height / RUNG_SPACING));
    for (let i = 0; i < rungCount; i++) {
      const rung = new Rectangle({
        width: LADDER_WIDTH,
        height: RUNG_HEIGHT,
        color,
      });
      const rungY = i * RUNG_SPACING + RUNG_SPACING / 2;
      members.push({ graphic: rung, offset: vec(0, rungY) });
    }

    const group = new GraphicsGroup({
      useAnchor: false,
      members,
    });

    this.graphics.use(group);
  }
}
