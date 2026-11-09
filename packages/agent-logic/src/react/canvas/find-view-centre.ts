import type { Viewport } from '@xyflow/react';

/** A box in canvas coordinates. */
export interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// How far inside the view the top-left corner of a box larger than the view lands.
const MARGIN = 16;

/** Returns the point to centre the view on to bring a box into it, or `undefined` when the box is already wholly in view. */
export function findViewCentre(box: CanvasBox, view: CanvasBox): { x: number; y: number } | undefined {
  const isInside =
    box.x >= view.x &&
    box.y >= view.y &&
    box.x + box.width <= view.x + view.width &&
    box.y + box.height <= view.y + view.height;
  if (isInside) return undefined;
  // A box larger than the view keeps its top-left corner, where a state's title is, in view.
  return {
    x: box.width > view.width ? box.x + view.width / 2 - MARGIN : box.x + box.width / 2,
    y: box.height > view.height ? box.y + view.height / 2 - MARGIN : box.y + box.height / 2,
  };
}

/** Returns the part of the canvas that a viewport shows on a pane of the given size, in canvas coordinates. */
export function readView({ x, y, zoom }: Viewport, width: number, height: number): CanvasBox {
  return { x: -x / zoom, y: -y / zoom, width: width / zoom, height: height / zoom };
}
