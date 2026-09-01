import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ResizableEngine, useContainerResize } from '../useContainerResize.js';

type ResizeCallback = ResizeObserverCallback;

// Holds the callback the hook hands to its observer, so that a test can drive a resize directly.
const captured: { callback: ResizeCallback | undefined } = { callback: undefined };
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockResizeObserver {
  observe = mockObserve;
  unobserve = vi.fn();
  disconnect = mockDisconnect;

  constructor(callback: ResizeCallback) {
    captured.callback = callback;
  }
}

describe('useContainerResize', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    captured.callback = undefined;
    mockObserve.mockClear();
    mockDisconnect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the canvas parent element on mount', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.append(canvas);

    const canvasRef = { current: canvas };
    const engineRef: { current: ResizableEngine | null } = { current: null };

    renderHook(() => useContainerResize(canvasRef, engineRef));

    expect(mockObserve).toHaveBeenCalledWith(container);
  });

  it('disconnects the observer on unmount', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.append(canvas);

    const canvasRef = { current: canvas };
    const engineRef: { current: ResizableEngine | null } = { current: null };

    const { unmount } = renderHook(() => useContainerResize(canvasRef, engineRef));

    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not observe when canvas ref is null', () => {
    const canvasRef = { current: null };
    const engineRef: { current: ResizableEngine | null } = { current: null };

    renderHook(() => useContainerResize(canvasRef, engineRef));

    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('resets canvas inline styles and invokes resize handler on container resize', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.append(canvas);
    canvas.style.width = '500px';
    canvas.style.height = '250px';

    const mockResizeHandler = vi.fn();
    const mockEngine: ResizableEngine = {
      screen: { _resizeHandler: mockResizeHandler },
    };

    const canvasRef = { current: canvas };
    const engineRef: { current: ResizableEngine | null } = { current: mockEngine };

    renderHook(() => useContainerResize(canvasRef, engineRef));

    const { callback } = captured;
    if (callback === undefined) {
      throw new Error('Expected ResizeObserver callback to be captured');
    }

    // Simulate a container resize
    callback([], new MockResizeObserver(() => {}));

    // Canvas inline styles should be reset to 100%
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');

    // Excalibur's internal resize handler should be invoked
    expect(mockResizeHandler).toHaveBeenCalledTimes(1);
  });

  it('does not throw when engine ref is null during resize', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.append(canvas);

    const canvasRef = { current: canvas };
    const engineRef: { current: ResizableEngine | null } = { current: null };

    renderHook(() => useContainerResize(canvasRef, engineRef));

    const { callback } = captured;
    if (callback === undefined) {
      throw new Error('Expected ResizeObserver callback to be captured');
    }

    // Should not throw when engine is null
    expect(() => {
      callback([], new MockResizeObserver(() => {}));
    }).not.toThrow();
  });
});
