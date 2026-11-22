/** The edges of a box on screen, as `getBoundingClientRect` reports them. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ConnectorInput {
  /** The box at the line's start, in a region at the left. */
  start: ScreenRect;
  /** The visible part of the region that holds `start`. */
  startBounds: ScreenRect;
  /** The first line box at the line's end; the line ends in the gutter of `endBounds` level with it. */
  end: ScreenRect;
  /** The visible part of the scrolling region that holds `end`, at the right of the start's region. */
  endBounds: ScreenRect;
  /** The top-left corner of the overlay in which the line is drawn. */
  origin: { x: number; y: number };
}

export interface Connector {
  /** An SVG path in the overlay's coordinates. */
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Returns the curve that joins a box to a line of text in a region at its right, or `undefined` when either is out of
 * view.
 */
export function buildConnector({ start, startBounds, end, endBounds, origin }: ConnectorInput): Connector | undefined {
  const startX = Math.min(start.right, startBounds.right);
  const startY = start.top + Math.min((start.bottom - start.top) / 2, MAX_ANCHOR_DROP);
  const endX = endBounds.left + GUTTER_INSET;
  const endY = (end.top + end.bottom) / 2;

  const isStartInView = startX >= startBounds.left && start.left <= startBounds.right && isWithin(startY, startBounds);
  const isEndInView = isWithin(endY, endBounds);
  if (!isStartInView || !isEndInView) return undefined;

  const from = { x: startX - origin.x, y: startY - origin.y };
  const to = { x: endX - origin.x, y: endY - origin.y };
  const middleX = (from.x + to.x) / 2;
  return {
    path: `M${from.x},${from.y} C${middleX},${from.y} ${middleX},${to.y} ${to.x},${to.y}`,
    start: from,
    end: to,
  };
}

// region | Helpers
// How far below a box's top the line starts, at most, so that it meets a tall box at its title.
const MAX_ANCHOR_DROP = 18;
// Where the line ends inside the end region's left padding, so that it never crosses the text before the line.
const GUTTER_INSET = 8;

/** Returns whether a vertical position is between a box's top and bottom. */
function isWithin(y: number, rect: ScreenRect): boolean {
  return y >= rect.top && y <= rect.bottom;
}
// endregion | Helpers
