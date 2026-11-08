import { type FitViewOptions, getViewportForBounds, type Rect } from '@xyflow/react';

import type { FlowNameSite } from '../../layout/to-flow-elements.ts';

/** How much of the canvas's text is drawn at a zoom: all of it, only the 14px text, or none, leaving shapes. */
export type DetailLevel = 'all-text' | 'large-text' | 'shapes';

// Text is drawn while it renders at 9px or more on screen: 14px text from this zoom, 12px text from the next.
export const LARGE_TEXT_MIN_ZOOM = 9 / 14;
export const SMALL_TEXT_MIN_ZOOM = 9 / 12;

/** The zoom at which a state shown as a box is centred when clicked. */
export const READING_ZOOM = 1;

// The top padding leaves 24px of screen room for the root's flow name, which sits above the chart's bounds.
export const FIT_PADDING: NonNullable<FitViewOptions['padding']> = {
  top: '40px',
  right: '16px',
  bottom: '16px',
  left: '16px',
};

/** Returns the detail level at a zoom. */
export function findDetailLevel(zoom: number): DetailLevel {
  if (zoom >= SMALL_TEXT_MIN_ZOOM) return 'all-text';
  if (zoom >= LARGE_TEXT_MIN_ZOOM) return 'large-text';
  return 'shapes';
}

/** The screen height of a flow's name, its padding included, which `canvas.css` holds at every zoom. */
export const FLOW_NAME_HEIGHT = 24;

// The flow name's average character width and maximum width in `canvas.css`, at its fixed screen size.
const FLOW_NAME_CHARACTER_WIDTH = 7.5;
const FLOW_NAME_MAX_WIDTH = 360;
const FLOW_NAME_GAP = 12;

/** Estimates the screen width of a flow's name. */
export function estimateFlowNameWidth(name: string): number {
  return Math.min(FLOW_NAME_MAX_WIDTH, Math.ceil(name.length * FLOW_NAME_CHARACTER_WIDTH));
}

/** Where a flow's name sits at a zoom: how far, in canvas units, it moves right, and whether it is shown at all. */
export interface FlowNamePlacement {
  shift: number;
  isShown: boolean;
}

/**
 * Returns where each flow's name sits at a zoom. Each name sits above its flow's top edge at a fixed screen size and,
 * taking the flows in order, moves past every name already placed that it would overlap. A name that would then start
 * at or past its flow's right edge would name nothing, so it is hidden, and later names do not move past it.
 */
export function placeFlowNames(sites: readonly FlowNameSite[], zoom: number): Map<string, FlowNamePlacement> {
  const placed: Array<{ left: number; right: number; top: number }> = [];
  const placements = new Map<string, FlowNamePlacement>();
  for (const { id, name, x, y, width: flowWidth } of sites) {
    const width = estimateFlowNameWidth(name);
    const top = y * zoom - FLOW_NAME_HEIGHT;
    let left = x * zoom;
    let blocker = findBlocker(placed, left, left + width, top);
    while (blocker !== undefined) {
      left = blocker.right + FLOW_NAME_GAP;
      blocker = findBlocker(placed, left, left + width, top);
    }
    const isShown = left < (x + flowWidth) * zoom;
    if (isShown) placed.push({ left, right: left + width, top });
    placements.set(id, { shift: isShown ? (left - x * zoom) / zoom : 0, isShown });
  }
  return placements;
}

/** Returns the zoom that fits the bounds in a canvas of the given size, capped at the reading zoom. */
export function findFitZoom(bounds: Rect, width: number, height: number): number {
  if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return READING_ZOOM;
  return getViewportForBounds(bounds, width, height, Number.MIN_VALUE, READING_ZOOM, FIT_PADDING).zoom;
}

// region | Helpers
/** Returns a placed name that a name spanning the given screen box would overlap or come within the gap of. */
function findBlocker(
  placed: ReadonlyArray<{ left: number; right: number; top: number }>,
  left: number,
  right: number,
  top: number,
): { left: number; right: number; top: number } | undefined {
  return placed.find(
    (other) =>
      left < other.right + FLOW_NAME_GAP &&
      other.left < right + FLOW_NAME_GAP &&
      top < other.top + FLOW_NAME_HEIGHT &&
      other.top < top + FLOW_NAME_HEIGHT,
  );
}
// endregion | Helpers
