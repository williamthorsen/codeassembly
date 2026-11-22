// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FileStore, StoredFileEntry } from '@williamthorsen/toolbelt.text-file-store/proposed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORED_FILES_POLL_MS, useStoredFiles } from '../useStoredFiles.ts';

const FIRST = { name: 'first.agent-logic.json', modifiedAt: '2026-11-16T00:00:00.000Z' };
const SECOND = { name: 'second.agent-logic.json', modifiedAt: '2026-11-16T00:01:00.000Z' };

describe(useStoredFiles, () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('lists the store on mount, and a file added to it after one poll', async () => {
    const store = buildListingStore([FIRST]);
    const { result } = renderHook(() => useStoredFiles(store));
    await waitFor(() => expect(result.current.files).toEqual([FIRST]));

    store.files = [SECOND, FIRST];
    await act(() => vi.advanceTimersByTimeAsync(STORED_FILES_POLL_MS));

    expect(result.current.files).toEqual([SECOND, FIRST]);
  });

  it('does not poll while the page is hidden, and lists the store again when the page becomes visible', async () => {
    const store = buildListingStore([FIRST]);
    const { result } = renderHook(() => useStoredFiles(store));
    await waitFor(() => expect(result.current.files).toEqual([FIRST]));
    setVisibility('hidden');
    store.files = [SECOND];

    await act(() => vi.advanceTimersByTimeAsync(STORED_FILES_POLL_MS * 2));
    expect(result.current.files).toEqual([FIRST]);

    setVisibility('visible');
    await act(async () => {
      globalThis.document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.files).toEqual([SECOND]);
  });

  it('keeps the same array when a poll finds the store unchanged', async () => {
    const store = buildListingStore([FIRST]);
    const { result } = renderHook(() => useStoredFiles(store));
    await waitFor(() => expect(result.current.files).toEqual([FIRST]));
    const listed = result.current.files;

    store.files = [{ ...FIRST }];
    await act(() => vi.advanceTimersByTimeAsync(STORED_FILES_POLL_MS));

    expect(result.current.files).toBe(listed);
  });

  it('keeps the last list when a listing fails', async () => {
    const store = buildListingStore([FIRST]);
    const { result } = renderHook(() => useStoredFiles(store));
    await waitFor(() => expect(result.current.files).toEqual([FIRST]));

    store.fails = true;
    await act(() => vi.advanceTimersByTimeAsync(STORED_FILES_POLL_MS));

    expect(result.current.files).toEqual([FIRST]);
  });

  it('lists the store at once on refresh', async () => {
    const store = buildListingStore([FIRST]);
    const { result } = renderHook(() => useStoredFiles(store));
    await waitFor(() => expect(result.current.files).toEqual([FIRST]));

    store.files = [SECOND];
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.files).toEqual([SECOND]);
  });

  it('keeps a newer listing when an older one resolves after it', async () => {
    const pending: Array<(files: StoredFileEntry[]) => void> = [];
    const store = buildPendingStore(pending);
    const { result } = renderHook(() => useStoredFiles(store));
    act(() => result.current.refresh());
    const [resolveOlder, resolveNewer] = pending;

    await act(async () => {
      resolveNewer?.([SECOND]);
      resolveOlder?.([FIRST]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.files).toEqual([SECOND]);
  });
});

// region | Helpers
/** Returns a store whose listing a test changes through `files`, and makes fail through `fails`. */
function buildListingStore(files: StoredFileEntry[]): FileStore & { files: StoredFileEntry[]; fails: boolean } {
  const store = {
    files,
    fails: false,
    list: () => (store.fails ? Promise.reject(new Error('Unreachable.')) : Promise.resolve(store.files)),
    read: () => Promise.reject(new Error('Not read.')),
    remove: () => Promise.reject(new Error('Not removed.')),
    write: () => Promise.reject(new Error('Not written.')),
  };
  return store;
}

/** Returns a store whose every listing waits until the test resolves it through `pending`. */
function buildPendingStore(pending: Array<(files: StoredFileEntry[]) => void>): FileStore {
  return {
    list: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
    read: () => Promise.reject(new Error('Not read.')),
    remove: () => Promise.reject(new Error('Not removed.')),
    write: () => Promise.reject(new Error('Not written.')),
  };
}

/** Sets the document's visibility state, which the DOM environment otherwise fixes at `visible`. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true, value: state });
}
// endregion | Helpers
