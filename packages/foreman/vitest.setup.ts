import { configure } from '@testing-library/dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

configure({ testIdAttribute: 'data-test-id' });

// Auto-cleanup only registers when test globals are exposed, and this suite runs without them.
afterEach(() => {
  cleanup();
});

const matchMediaStub: typeof globalThis.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener(): void {},
  removeEventListener(): void {},
  addListener(): void {},
  removeListener(): void {},
  dispatchEvent(): boolean {
    return false;
  },
});

const resizeObserverStub: typeof globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// jsdom provides neither matchMedia nor ResizeObserver; Mantine components consult both when rendering.
// `defineProperties` survives the `vi.unstubAllGlobals()` that two suites run in `afterEach`; a `vi.stubGlobal` stub would not.
Object.defineProperties(globalThis, {
  matchMedia: { configurable: true, value: matchMediaStub, writable: true },
  ResizeObserver: { configurable: true, value: resizeObserverStub, writable: true },
});
