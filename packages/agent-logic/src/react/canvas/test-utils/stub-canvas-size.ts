import { vi } from 'vitest';

/**
 * Lays the canvas out as a browser would at the given size, since happy-dom lays nothing out: an element takes its
 * inline size in pixels, which React Flow sets on each node, or else the canvas's, and a resize observer reports each
 * element as soon as it observes it.
 */
export function stubCanvasSize(width: number, height: number): void {
  vi.spyOn(HTMLElement.prototype, 'checkVisibility').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return readPixels(this.style.width) ?? width;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return readPixels(this.style.height) ?? height;
  });
  vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
}

// region | Helpers
/** A resize observer that reports each element once, on the task after it starts observing it. */
class ImmediateResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  /** Does nothing, because the observer holds no state between reports. */
  disconnect(): void {}

  /** Reports the element on the next task. */
  observe(target: Element): void {
    setTimeout(() => {
      this.#callback([buildEntry(target)], this);
    }, 0);
  }

  /** Does nothing, because each element is reported once. */
  unobserve(): void {}
}

/** Builds the entry that reports an element with its laid-out size. */
function buildEntry(target: Element): ResizeObserverEntry {
  const box = { inlineSize: 0, blockSize: 0 };
  return {
    target,
    contentRect: target.getBoundingClientRect(),
    borderBoxSize: [box],
    contentBoxSize: [box],
    devicePixelContentBoxSize: [box],
  };
}

/** Returns a CSS length in pixels, or `undefined` when it is not one. */
function readPixels(length: string): number | undefined {
  return length.endsWith('px') ? Number.parseFloat(length) : undefined;
}
// endregion | Helpers
