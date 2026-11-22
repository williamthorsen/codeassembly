/* eslint-disable testing-library/no-container, testing-library/no-node-access -- The line is an `aria-hidden` SVG,
which has no accessible query. */
// @vitest-environment happy-dom
import { render, waitFor } from '@testing-library/react';
import { type ReactElement, type RefObject, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceLine } from '../SourceLine.tsx';

const PATH = 'states.greeting';

/** The edges of a box on screen. */
interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The boxes of the harness's elements, keyed by each one's `data-rect`. */
const RECTS = new Map<string, Edges>([
  ['container', { left: 0, top: 0, right: 1300, bottom: 700 }],
  ['canvas', { left: 0, top: 0, right: 800, bottom: 700 }],
  ['element', { left: 100, top: 100, right: 300, bottom: 200 }],
  ['prompt', { left: 820, top: 0, right: 1300, bottom: 700 }],
  ['passage', { left: 900, top: 300, right: 1000, bottom: 326 }],
]);

describe(SourceLine, () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return buildDomRect(findRect(this));
    });
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return buildRectList([buildDomRect(findRect(this))]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the line from the selected element to its passage', async () => {
    const { container } = render(<Harness selectedPath={PATH} />);

    await waitFor(() => {
      expect(container.querySelector(':scope .statechart-source-line path')).toHaveAttribute(
        'd',
        'M300,118 C564,118 564,313 828,313',
      );
    });
  });

  it('removes the line when the selection clears', async () => {
    const { container, rerender } = render(<Harness selectedPath={PATH} />);
    await waitFor(() => {
      expect(container.querySelector('.statechart-source-line')).not.toBeNull();
    });

    rerender(<Harness selectedPath={undefined} />);

    await waitFor(() => {
      expect(container.querySelector('.statechart-source-line')).toBeNull();
    });
  });

  it('offers its redraw while mounted and withdraws it on unmount', () => {
    const redrawRef: RefObject<(() => void) | undefined> = { current: undefined };
    const { unmount } = render(<Harness selectedPath={PATH} redrawRef={redrawRef} />);

    expect(redrawRef.current).toBeTypeOf('function');

    unmount();

    expect(redrawRef.current).toBeUndefined();
  });
});

// region | Helpers
/** Returns a `DOMRect` with the given edges. */
function buildDomRect({ left, top, right, bottom }: Edges): DOMRect {
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Returns a `DOMRectList` of the given rects. */
function buildRectList(rects: DOMRect[]): DOMRectList {
  const list = new RectList();
  list.push(...rects);
  return list;
}

/** Returns the box that `RECTS` gives the element, or an empty one for an element outside the harness. */
function findRect(element: Element): Edges {
  const key = element instanceof HTMLElement ? element.dataset['rect'] : undefined;
  return RECTS.get(key ?? '') ?? { left: 0, top: 0, right: 0, bottom: 0 };
}

/** Renders a canvas element and a prompt passage, the two ends of a workspace's line, with the line over them. */
function Harness({
  selectedPath,
  redrawRef,
}: {
  selectedPath: string | undefined;
  redrawRef?: RefObject<(() => void) | undefined>;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const ownRedrawRef = useRef<(() => void) | undefined>(undefined);
  return (
    <div ref={containerRef} data-rect="container">
      <div className="statechart-canvas" data-rect="canvas">
        <div data-path={PATH} data-rect="element" />
      </div>
      <div data-prompt-text="" data-rect="prompt">
        <span data-passage-for={PATH} data-rect="passage" />
      </div>
      <SourceLine containerRef={containerRef} selectedPath={selectedPath} redrawRef={redrawRef ?? ownRedrawRef} />
    </div>
  );
}

/** A list of rects, standing in for the `DOMRectList` that a page cannot construct. */
class RectList extends Array<DOMRect> implements DOMRectList {
  /** Returns the rect at an index, or `null` past the end. */
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}
// endregion | Helpers
