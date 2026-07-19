import { configure } from '@testing-library/dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

configure({ testIdAttribute: 'data-test-id' });

// Auto-cleanup only registers when test globals are exposed, and this suite runs without them.
afterEach(() => {
  cleanup();
});

// jsdom provides neither matchMedia nor ResizeObserver; Mantine components consult both when rendering.
globalThis.matchMedia = function matchMedia(query: string): MediaQueryList {
  return {
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
  };
};

globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
