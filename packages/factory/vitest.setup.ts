import '@testing-library/jest-dom/vitest';

// jsdom does not provide ResizeObserver. Install a minimal stub so that components using
// useContainerResize can be rendered in tests. The descriptor stays writable and configurable
// so that a suite needing its own observer can stub over this one and restore it afterward.
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
  writable: true,
});
