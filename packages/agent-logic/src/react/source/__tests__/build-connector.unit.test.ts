import { describe, expect, it } from 'vitest';

import { buildConnector, type ConnectorInput } from '../build-connector.ts';

const INPUT: ConnectorInput = {
  start: { left: 100, top: 100, right: 300, bottom: 200 },
  startBounds: { left: 0, top: 50, right: 800, bottom: 700 },
  end: { left: 900, top: 300, right: 1000, bottom: 326 },
  endBounds: { left: 820, top: 250, right: 1300, bottom: 700 },
  origin: { x: 0, y: 50 },
};

describe(buildConnector, () => {
  it("joins the start box's right edge near its top to the end region's gutter level with the end line", () => {
    expect(buildConnector(INPUT)).toEqual({
      path: 'M300,68 C564,68 564,263 828,263',
      start: { x: 300, y: 68 },
      end: { x: 828, y: 263 },
    });
  });

  it('starts at the edge of its region when the start box extends past it', () => {
    const line = buildConnector({ ...INPUT, start: { left: 700, top: 100, right: 1000, bottom: 120 } });

    expect(line?.start).toEqual({ x: 800, y: 60 });
  });

  it('draws nothing when the start box is outside its region', () => {
    expect(buildConnector({ ...INPUT, start: { left: 100, top: 0, right: 300, bottom: 20 } })).toBeUndefined();
    expect(buildConnector({ ...INPUT, start: { left: 900, top: 100, right: 1000, bottom: 200 } })).toBeUndefined();
  });

  it('draws nothing when the end line is scrolled out of its region', () => {
    expect(buildConnector({ ...INPUT, end: { left: 900, top: 720, right: 1000, bottom: 746 } })).toBeUndefined();
  });
});
