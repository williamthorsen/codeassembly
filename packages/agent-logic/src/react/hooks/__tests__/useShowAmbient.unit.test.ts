// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHOW_AMBIENT_KEY, useShowAmbient } from '../useShowAmbient.ts';

describe(useShowAmbient, () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts shown, and a later mount reads a hidden setting back', () => {
    const view = renderHook(() => useShowAmbient());
    expect(view.result.current[0]).toBe(true);

    act(() => view.result.current[1](false));
    view.unmount();

    expect(renderHook(() => useShowAmbient()).result.current[0]).toBe(false);
    expect(globalThis.localStorage.getItem(SHOW_AMBIENT_KEY)).toBe('false');
  });

  it('starts shown and still changes when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useShowAmbient());

    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
