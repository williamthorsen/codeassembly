import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSelectionParams } from '../useSelectionParams.js';

describe('useSelectionParams', () => {
  const replaceStateSpy = vi.spyOn(globalThis.history, 'replaceState');

  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/');
    replaceStateSpy.mockClear();
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('returns empty strings when URL has no params', () => {
    const { result } = renderHook(() => useSelectionParams());

    expect(result.current.initialParams).toEqual({
      project: '',
      ticket: '',
      run: '',
      vis: '',
    });
  });

  it('reads existing params from URL', () => {
    globalThis.history.replaceState(null, '', '/?project=my-proj&ticket=TK-1&run=run-42');

    const { result } = renderHook(() => useSelectionParams());

    expect(result.current.initialParams).toEqual({
      project: 'my-proj',
      ticket: 'TK-1',
      run: 'run-42',
      vis: '',
    });
  });

  it('reads partial params from URL', () => {
    globalThis.history.replaceState(null, '', '/?project=my-proj');

    const { result } = renderHook(() => useSelectionParams());

    expect(result.current.initialParams).toEqual({
      project: 'my-proj',
      ticket: '',
      run: '',
      vis: '',
    });
  });

  it('reads vis param from URL', () => {
    globalThis.history.replaceState(null, '', '/?vis=factory-floor');

    const { result } = renderHook(() => useSelectionParams());

    expect(result.current.initialParams).toEqual({
      project: '',
      ticket: '',
      run: '',
      vis: 'factory-floor',
    });
  });

  it('setParams adds params to URL', () => {
    const { result } = renderHook(() => useSelectionParams());

    result.current.setParams({ project: 'alpha' });

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=alpha');
  });

  it('setParams removes empty params', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha&ticket=T-1&run=run-a');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useSelectionParams());

    result.current.setParams({ ticket: '', run: '' });

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=alpha');
  });

  it('setParams handles cascade clear (set project, clear ticket+run)', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha&ticket=T-1&run=run-a');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useSelectionParams());

    result.current.setParams({ project: 'beta', ticket: '', run: '' });

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?project=beta');
  });

  it('setParams removes query string entirely when all params cleared', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha');
    replaceStateSpy.mockClear();

    const { result } = renderHook(() => useSelectionParams());

    result.current.setParams({ project: '' });

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('initialParams is stable across re-renders', () => {
    globalThis.history.replaceState(null, '', '/?project=alpha');

    const { result, rerender } = renderHook(() => useSelectionParams());

    const firstParams = result.current.initialParams;
    rerender();
    const secondParams = result.current.initialParams;

    expect(firstParams).toBe(secondParams);
  });

  it('setParams is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useSelectionParams());

    const firstSetParams = result.current.setParams;
    rerender();
    const secondSetParams = result.current.setParams;

    expect(firstSetParams).toBe(secondSetParams);
  });
});
