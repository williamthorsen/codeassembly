import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVisualizationParam } from '../useVisualizationParam.js';

describe('useVisualizationParam', () => {
  const replaceStateSpy = vi.spyOn(globalThis.history, 'replaceState');

  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/');
    replaceStateSpy.mockClear();
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('returns "factory" when URL has no visualization param', () => {
    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('factory');
  });

  it('returns "factory" when URL has visualization=factory and does not call replaceState', () => {
    globalThis.history.replaceState(null, '', '/?visualization=factory');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('factory');
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('returns "flow" when URL has visualization=flow', () => {
    globalThis.history.replaceState(null, '', '/?visualization=flow');

    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('flow');
  });

  it('returns "catwalk" when URL has visualization=catwalk', () => {
    globalThis.history.replaceState(null, '', '/?visualization=catwalk');

    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('catwalk');
  });

  it('strips invalid value from URL on mount and returns "factory"', () => {
    globalThis.history.replaceState(null, '', '/?visualization=unknown');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('factory');
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('strips invalid value from URL on mount while preserving other params', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha&ticket=T-1&visualization=unknown');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    expect(result.current[0]).toBe('factory');
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=alpha&ticket=T-1');
  });

  it('setActiveView("flow") updates URL to include visualization=flow', () => {
    const { result } = renderHook(() => useVisualizationParam());

    result.current[1]('flow');

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=flow');
  });

  it('setActiveView("catwalk") updates URL to include visualization=catwalk', () => {
    const { result } = renderHook(() => useVisualizationParam());

    result.current[1]('catwalk');

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=catwalk');
  });

  it('setActiveView("factory") removes the visualization param from URL', () => {
    globalThis.history.replaceState(null, '', '/?visualization=flow');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    result.current[1]('factory');

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('setActiveView("factory") removes the visualization param while preserving other params', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha&ticket=T-1&run=run-a&visualization=flow');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    result.current[1]('factory');

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=alpha&ticket=T-1&run=run-a');
  });

  it('preserves other query params when updating the visualization param', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha&ticket=T-1&run=run-a');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useVisualizationParam());

    result.current[1]('flow');

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=alpha&ticket=T-1&run=run-a&visualization=flow');
  });

  it('setActiveView is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useVisualizationParam());

    const firstSetActiveView = result.current[1];
    rerender();
    const secondSetActiveView = result.current[1];

    expect(firstSetActiveView).toBe(secondSetActiveView);
  });
});
