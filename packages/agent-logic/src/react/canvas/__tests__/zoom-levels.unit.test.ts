// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import {
  estimateFlowNameWidth,
  findDetailLevel,
  findFitZoom,
  FLOW_NAME_HEIGHT,
  type FlowNamePlacement,
  LARGE_TEXT_MIN_ZOOM,
  placeFlowNames,
  READING_ZOOM,
  SMALL_TEXT_MIN_ZOOM,
} from '../zoom-levels.ts';

describe(findDetailLevel, () => {
  it('draws all text from the zoom at which 12px text renders at 9px', () => {
    expect(findDetailLevel(SMALL_TEXT_MIN_ZOOM)).toBe('all-text');
    expect(findDetailLevel(2)).toBe('all-text');
  });

  it('draws only the 14px text between the two thresholds', () => {
    expect(findDetailLevel(SMALL_TEXT_MIN_ZOOM - 0.001)).toBe('large-text');
    expect(findDetailLevel(LARGE_TEXT_MIN_ZOOM)).toBe('large-text');
  });

  it('draws shapes alone below the zoom at which 14px text renders at 9px', () => {
    expect(findDetailLevel(LARGE_TEXT_MIN_ZOOM - 0.001)).toBe('shapes');
  });
});

describe(placeFlowNames, () => {
  // Each id is shorter than its name, so that a width estimated from the id would leave the names overlapping.
  const root = { id: 'root', name: 'Curate feedback', x: 12, y: 12, width: 2000 };
  const nested = { id: 'nested', name: 'When a result has', x: 40, y: 48, width: 1000 };
  const crowdedZoom = (FLOW_NAME_HEIGHT - 1) / 36;

  it("moves a crowded nested name right until it starts 12px past the end of its parent's name", () => {
    const placements = placeFlowNames([root, nested], crowdedZoom);

    expect(placements.get(root.id)).toStrictEqual({ shift: 0, isShown: true });
    expect((nested.x + readShift(placements, nested.id)) * crowdedZoom).toBeCloseTo(
      root.x * crowdedZoom + estimateFlowNameWidth(root.name) + 12,
    );
  });

  it('leaves every name in place from the zoom at which the nesting offset renders as tall as a name', () => {
    const placements = placeFlowNames([root, nested], FLOW_NAME_HEIGHT / 36);

    expect(placements.values().toArray()).toStrictEqual([
      { shift: 0, isShown: true },
      { shift: 0, isShown: true },
    ]);
  });

  it("leaves a nested name in place when its flow starts past the end of its parent's name", () => {
    expect(placeFlowNames([root, { ...nested, x: 1000 }], crowdedZoom).get(nested.id)).toStrictEqual({
      shift: 0,
      isShown: true,
    });
  });

  it("moves a name nested two levels deep past its parent's moved name", () => {
    const deeper = { id: 'deeper', name: 'Retry the failed fix until it passes', x: 68, y: 84, width: 900 };

    const placements = placeFlowNames([root, nested, deeper], crowdedZoom);
    const nestedRight =
      (nested.x + readShift(placements, nested.id)) * crowdedZoom + estimateFlowNameWidth(nested.name);

    expect((deeper.x + readShift(placements, deeper.id)) * crowdedZoom).toBeCloseTo(nestedRight + 12);
  });

  it('moves the second of two sibling names that would meet past the first', () => {
    const sibling = { id: 'sibling', name: 'When a fix fails', x: 60, y: 48, width: 1000 };

    const placements = placeFlowNames([root, nested, sibling], crowdedZoom);
    const nestedRight =
      (nested.x + readShift(placements, nested.id)) * crowdedZoom + estimateFlowNameWidth(nested.name);

    expect((sibling.x + readShift(placements, sibling.id)) * crowdedZoom).toBeCloseTo(nestedRight + 12);
  });

  it("hides a crowded nested name that would start past its own flow's right edge", () => {
    const narrow = { ...nested, width: 100 };

    expect(placeFlowNames([root, narrow], crowdedZoom).get(narrow.id)).toStrictEqual({ shift: 0, isShown: false });
  });

  it('moves a later name past the names shown, not past a hidden one', () => {
    const narrow = { ...nested, width: 100 };
    const sibling = { id: 'sibling', name: 'When a fix fails', x: 60, y: 48, width: 1000 };

    const placements = placeFlowNames([root, narrow, sibling], crowdedZoom);

    expect((sibling.x + readShift(placements, sibling.id)) * crowdedZoom).toBeCloseTo(
      root.x * crowdedZoom + estimateFlowNameWidth(root.name) + 12,
    );
  });
});

describe(findFitZoom, () => {
  it('returns the reading zoom for a chart smaller than the canvas', () => {
    expect(findFitZoom({ x: 0, y: 0, width: 400, height: 300 }, 1000, 600)).toBe(READING_ZOOM);
  });

  it('returns the zoom at which a larger chart fits inside the padded canvas', () => {
    const zoom = findFitZoom({ x: 0, y: 0, width: 2000, height: 1000 }, 1000, 600);

    // The width binds: 2,000px must fit in 1,000px less 16px on each side.
    expect(zoom).toBeCloseTo(968 / 2000);
  });

  it('reserves room above the chart for its flow name when the height binds', () => {
    const zoom = findFitZoom({ x: 0, y: 0, width: 1000, height: 2000 }, 1000, 600);

    // 2,000px must fit in 600px less 40px above and 16px below.
    expect(zoom).toBeCloseTo(544 / 2000);
  });

  it('returns the reading zoom while the canvas has no size', () => {
    expect(findFitZoom({ x: 0, y: 0, width: 2000, height: 1000 }, 0, 0)).toBe(READING_ZOOM);
  });
});

// region | Helpers
/** Returns how far a flow's name moves right in canvas units. */
function readShift(placements: Map<string, FlowNamePlacement>, id: string): number {
  return placements.get(id)?.shift ?? 0;
}
// endregion | Helpers
