import { Actor, Color, Font, GraphicsGroup, Rectangle, Text, vec, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

const STATION_WIDTH = 100;
const STATION_HEIGHT = 60;

export class StationActor extends Actor {
  constructor(phase: string, active: boolean, position: Vector) {
    const color = active ? PALETTE.lightGray : PALETTE.darkGray;
    super({
      pos: position,
      width: STATION_WIDTH,
      height: STATION_HEIGHT,
    });

    const rect = new Rectangle({
      width: STATION_WIDTH,
      height: STATION_HEIGHT,
      color: Color.fromHex(color),
    });

    const label = new Text({
      text: phase,
      color: Color.fromHex(PALETTE.white),
      font: new Font({ size: 10 }),
    });

    const group = new GraphicsGroup({
      useAnchor: false,
      members: [
        { graphic: rect, offset: vec(0, 0) },
        { graphic: label, offset: vec(10, STATION_HEIGHT / 2 - 5), useBounds: false },
      ],
    });

    this.graphics.use(group);
  }
}
