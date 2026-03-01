import { Actor, Color, Font, GraphicsGroup, Rectangle, Text, TextAlign, vec, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const STATION_WIDTH = 100;
const STATION_HEIGHT = 40;
const PLATFORM_HEIGHT = 20;

export class StationActor extends Actor {
  constructor(role: string, active: boolean, position: Vector) {
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
      font: new Font({ size: 10, textAlign: TextAlign.Center }),
    });

    const group = new GraphicsGroup({
      members: [
        { graphic: rect, offset: vec(0, 0) },
        { graphic: label, offset: vec(STATION_WIDTH / 2, STATION_HEIGHT / 2 + PLATFORM_HEIGHT / 2 - 5), useBounds: false },
      ],
    });

    this.graphics.use(group);
  }
}
