// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  createMemoryFileStore,
  type FileStore,
  type StoredFileWrite,
} from '@williamthorsen/toolbelt.text-file-store/proposed';
import { beforeEach, describe, expect, it } from 'vitest';

import { examples } from '../../../examples/examples.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { navigateHistory } from '../../test-utils/navigate-history.ts';
import type { LoadFailure, OtherKindHandlers } from '../document-types.ts';
import { buildChartDocument, readConfigText } from '../read-document.ts';
import { useDocumentState } from '../useDocumentState.ts';

const CHART = 'notes.agent-logic.json';
const CONFIG = buildMinimalConfig();
const CHART_TEXT = JSON.stringify(CONFIG);
const NOTE_TEXT = '# Notes\n\nGreet the user.\n';

describe('useDocumentState with a kind that the app defines', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('opens a stored file of that kind that the URL names, and announces it through its handler', async () => {
    globalThis.history.replaceState(null, '', '/?file=notes.md');
    const { result, announcements } = renderNotes(createMemoryFileStore({ 'notes.md': NOTE_TEXT }));

    await waitFor(() => expect(result.current.document).toMatchObject({ kind: 'note', text: NOTE_TEXT }));
    expect(result.current.currentFileName).toBe('notes.md');
    expect(result.current.currentSlug).toBeUndefined();
    expect(announcements.at(-1)).toBe('Opened the note notes.md.');
  });

  it('stores a document of that kind through storeAndOpen and opens it under its own URL', async () => {
    const store = createMemoryFileStore();
    const { result } = renderNotes(store);

    await act(async () => {
      await expect(result.current.loadNote('notes.md', NOTE_TEXT)).resolves.toBeUndefined();
    });

    expect(result.current.document).toMatchObject({ kind: 'note', fileName: 'notes.md' });
    expect(globalThis.location.search).toBe('?file=notes.md');
    expect(await store.read('notes.md')).toEqual({ ok: true, text: NOTE_TEXT });
  });

  it('when the composed load refuses text before writing, prepareLoad has cleared the unknown example', async () => {
    globalThis.history.replaceState(null, '', '/?example=nope');
    const store = createMemoryFileStore();
    const { result } = renderNotes(store);
    expect(result.current.unknownExample).toBe('nope');

    let failure: LoadFailure | undefined;
    await act(async () => {
      failure = await result.current.loadNote('chart.md', CHART_TEXT);
    });

    expect(failure).toMatchObject({ kind: 'other-kind' });
    expect(result.current.unknownExample).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it("replaces a document with a chart in the document's history entry, announcing the after-write note", async () => {
    const store = createMemoryFileStore({ 'notes.md': NOTE_TEXT });
    const { result, announcements } = await renderOpenNote(store);
    const { length } = globalThis.history;

    await act(async () => {
      await result.current.storeAndOpen(
        { name: CHART, text: CHART_TEXT, replace: false },
        keepFailure,
        (key) => buildChartDocument(CHART, CONFIG, key),
        { afterWrite: () => Promise.resolve('notes.md remains.'), entry: 'replace' },
      );
    });

    expect(result.current.document).toMatchObject({ kind: 'chart', name: CHART });
    expect(globalThis.location.search).toBe(`?file=${CHART}`);
    expect(globalThis.history.length).toBe(length);
    expect(announcements.at(-1)).toMatch(/notes\.md remains\.$/);

    await navigateHistory(-1);
    expect(result.current.document).toBeUndefined();
  });

  it.each([
    { title: 'a name that the store holds', files: { [CHART]: '{}' }, isUnreachable: false, kind: 'conflict' },
    { title: 'a store out of reach', files: {}, isUnreachable: true, kind: 'store' },
  ])('passes $title to fail, without running afterWrite or leaving the document', async (testCase) => {
    const store = createMemoryFileStore({ 'notes.md': NOTE_TEXT, ...testCase.files });
    const { result } = await renderOpenNote(store);
    store.isUnreachable = testCase.isUnreachable;
    let isAfterWriteRun = false;

    let failure: LoadFailure | undefined;
    await act(async () => {
      failure = await result.current.storeAndOpen(
        { name: CHART, text: CHART_TEXT, replace: false },
        keepFailure,
        (key) => buildChartDocument(CHART, CONFIG, key),
        {
          afterWrite: () => {
            isAfterWriteRun = true;
            return Promise.resolve(undefined);
          },
        },
      );
    });

    expect(failure).toMatchObject({ kind: testCase.kind });
    expect(isAfterWriteRun).toBe(false);
    expect(result.current.document).toMatchObject({ kind: 'note' });
  });

  it('keeps what a navigation during the write showed, and still announces the after-write note', async () => {
    const memoryStore = createMemoryFileStore();
    const { promise: isWriteReleased, resolve: releaseWrite } = Promise.withResolvers<undefined>();
    const store: FileStore = {
      ...memoryStore,
      write: async (name, text, options): Promise<StoredFileWrite> => {
        await isWriteReleased;
        return memoryStore.write(name, text, options);
      },
    };
    const { result, announcements } = renderNotes(store);

    let stored: Promise<LoadFailure | undefined> = Promise.resolve(undefined);
    act(() => {
      stored = result.current.storeAndOpen(
        { name: CHART, text: CHART_TEXT, replace: false },
        keepFailure,
        (key) => buildChartDocument(CHART, CONFIG, key),
        { afterWrite: () => Promise.resolve('Stored after a navigation.') },
      );
    });
    act(() => result.current.chooseExample(requireExample(examples[0])));
    await act(async () => {
      releaseWrite(undefined);
      await stored;
    });

    expect(result.current.document?.name).toBe(examples[0]?.name);
    expect(announcements.at(-1)).toBe('Stored after a navigation.');
    expect(await memoryStore.read(CHART)).toMatchObject({ ok: true });
  });
});

// region | Helpers
interface Note {
  kind: 'note';
  key: number;
  name: string;
  fileName: string;
  text: string;
}

const NOTE_KIND: OtherKindHandlers<Note> = {
  read: (name, text, key) => (name.endsWith('.md') ? buildNote(name, text, key) : undefined),
  describe: (document) => `Opened the note ${document.fileName}.`,
};

/** Returns a note document of the stored file. */
function buildNote(fileName: string, text: string, key: number): Note {
  return { kind: 'note', key, name: fileName.slice(0, -'.md'.length), fileName, text };
}

/** Returns the failure unchanged, for a composed load that reports nothing of its own. */
function keepFailure(failure: LoadFailure): LoadFailure {
  return failure;
}

/** Renders the hook with the note kind, and a note load composed from `prepareLoad` and `storeAndOpen`. */
function renderNotes(store: FileStore) {
  const announcements: string[] = [];
  const announce = (text: string): void => {
    announcements.push(text);
  };
  const view = renderHook(() => {
    const state = useDocumentState({ fileStore: store, announce, otherKind: NOTE_KIND });
    async function loadNote(name: string, text: string): Promise<LoadFailure | undefined> {
      state.prepareLoad();
      if (readConfigText(text, 'paste').ok) return { kind: 'other-kind', problems: [] };
      return state.storeAndOpen({ name, text, replace: false }, keepFailure, (key) => buildNote(name, text, key));
    }
    return { ...state, loadNote };
  });
  return { ...view, announcements };
}

/** Renders the note kind and opens the stored `notes.md` from the start page. */
async function renderOpenNote(store: FileStore) {
  const view = renderNotes(store);
  act(() => view.result.current.chooseStoredFile('notes.md'));
  await waitFor(() => expect(view.result.current.document).toMatchObject({ kind: 'note' }));
  return view;
}

/** Returns the example, failing the test when the package does not bundle it. */
function requireExample<T>(example: T | undefined): T {
  if (example === undefined) throw new Error('Example not bundled');
  return example;
}
// endregion | Helpers
