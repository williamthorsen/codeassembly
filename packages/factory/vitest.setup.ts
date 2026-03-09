import '@testing-library/jest-dom/vitest';

// jsdom does not provide ResizeObserver. Assign a minimal stub so that
// components using useContainerResize can be rendered in tests.
globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
