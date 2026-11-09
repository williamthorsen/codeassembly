// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { findViewCentre } from '../find-view-centre.ts';

const VIEW = { x: 0, y: 0, width: 800, height: 500 };

describe(findViewCentre, () => {
  it('leaves the view alone when the box is wholly in it', () => {
    expect(findViewCentre({ x: 100, y: 100, width: 200, height: 100 }, VIEW)).toBeUndefined();
  });

  it('centres on the middle of a box that fits the view', () => {
    expect(findViewCentre({ x: 900, y: 600, width: 200, height: 100 }, VIEW)).toEqual({ x: 1000, y: 650 });
  });

  it('keeps the top-left corner of a box larger than the view inside it', () => {
    // A view centred here starts 16px above and to the left of the box's corner, at (884, 584).
    expect(findViewCentre({ x: 900, y: 600, width: 1000, height: 700 }, VIEW)).toEqual({ x: 1284, y: 834 });
  });
});
