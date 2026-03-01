import { Actor, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const STATION_WIDTH = 100;
const STATION_HEIGHT = 40;
const PLATFORM_HEIGHT = 20;

export class StationActor extends Actor {
  /**
   * @param labelOffsetX World-space x offset from the station center to the
   *   label's left edge. Typically the level-0 agent position relative to the
   *   station center (e.g. -36 with default layout).
   */
  constructor(role: string, active: boolean, position: Vector, labelOffsetX = 0) {
    const color = active ? PALETTE.lightGray : PALETTE.darkGray;
    super({
      pos: position,
      width: STATION_WIDTH,
      height: STATION_HEIGHT,
    });

    const rectColor = Color.fromHex(color);
    rectColor.a = 0.15;
    const rect = new Rectangle({
      width: STATION_WIDTH,
      height: STATION_HEIGHT,
      color: rectColor,
    });

    const labelColor = Color.fromHex(PALETTE.white);
    labelColor.a = 0.6;
    const label = new Text({
      text: role,
      color: labelColor,
      font: new Font({ size: 10, textAlign: TextAlign.Left }),
    });

    // Convert world-space offset to group-space: group origin is at the rect's
    // top-left corner (STATION_WIDTH/2 left of the actor center).
    const groupLabelX = STATION_WIDTH / 2 + labelOffsetX;

    const group = new GraphicsGroup({
      members: [
        { graphic: rect, offset: vec(0, 0) },
        { graphic: label, offset: vec(groupLabelX, STATION_HEIGHT + PLATFORM_HEIGHT / 2 - 5), useBounds: false },
      ],
    });

    this.graphics.use(group);
  }
}
