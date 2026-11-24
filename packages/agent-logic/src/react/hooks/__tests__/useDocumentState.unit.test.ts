// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryFileStore, type FileStore } from '@williamthorsen/toolbelt.text-file-store/proposed';
import { beforeEach, describe, expect, it } from 'vitest';

import { examples } from '../../../examples/examples.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { navigateHistory } from '../../test-utils/navigate-history.ts';
import { useDocumentState } from '../useDocumentState.ts';

const [changeApproval, passwordReset] = examples;
const MINIMAL_TEXT = JSON.stringify(buildMinimalConfig());

describe(useDocumentState, () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('opens the example that the URL names', () => {
    globalThis.history.replaceState(null, '', '/?example=password-reset');

    const { result } = renderDocumentState();

    expect(result.current.document).toMatchObject({ name: 'Password reset', typeLabel: 'Example' });
    expect(result.current.currentSlug).toBe('password-reset');
  });

  it('shows the start page when the URL names no example', () => {
    const { result } = renderDocumentState();

    expect(result.current.document).toBeUndefined();
  });

  it('opens a chosen example under its own URL, and announces it', () => {
    const { result, announcements } = renderDocumentState();

    act(() => result.current.chooseExample(requireExample(changeApproval)));

    expect(globalThis.location.search).toBe('?example=change-approval');
    expect(result.current.document?.name).toBe('Change approval');
    expect(announcements.at(-1)).toMatch(/Change approval/);
  });

  it('writes uploaded text into the store and opens it under its own URL, named after the file or the config', async () => {
    globalThis.history.replaceState(null, '', '/?example=password-reset');
    const store = createMemoryFileStore();
    const { result } = renderDocumentState(store);

    await act(async () => {
      await expect(
        result.current.loadText(MINIMAL_TEXT, { kind: 'file', fileName: 'chart.json' }),
      ).resolves.toBeUndefined();
    });
    expect(result.current.document).toMatchObject({ name: 'chart.prompt-logic.json', typeLabel: 'Prompt logic' });
    expect(result.current.currentSlug).toBeUndefined();
    expect(result.current.currentFileName).toBe('chart.prompt-logic.json');
    expect(globalThis.location.search).toBe('?file=chart.prompt-logic.json');
    expect(await store.read('chart.prompt-logic.json')).toMatchObject({ ok: true });

    await act(async () => {
      await result.current.loadText(MINIMAL_TEXT, { kind: 'paste' });
    });
    expect(result.current.document).toMatchObject({ name: 'agent.prompt-logic.json' });
  });

  it.each([
    { text: '{"id": ', kind: 'syntax' },
    { text: 'Greet the user.', kind: 'not-json' },
    { text: '{"id": "agent"}', kind: 'invalid' },
  ])('reports $kind text without opening it', async ({ text, kind }) => {
    const { result, announcements } = renderDocumentState();

    let failure: Awaited<ReturnType<typeof result.current.loadText>>;
    await act(async () => {
      failure = await result.current.loadText(text, { kind: 'paste' });
    });

    expect(failure).toMatchObject({ kind });
    expect(result.current.document).toBeUndefined();
    expect(announcements.at(-1)).toMatch(/not loaded|problem/i);
  });

  it('adds the hint to the problems of Upload text that is not JSON, when one is given', async () => {
    const { result } = renderDocumentState(createMemoryFileStore(), 'Use the other card.');

    let failure: Awaited<ReturnType<typeof result.current.loadText>>;
    await act(async () => {
      failure = await result.current.loadText('Greet the user.', { kind: 'paste' });
    });

    expect(failure?.problems.at(-1)?.message).toBe('Use the other card.');
  });

  it('reports a name that the store holds, and replaces the file on request', async () => {
    const store = createMemoryFileStore({ 'chart.prompt-logic.json': '{}' });
    const { result } = renderDocumentState(store);
    const origin = { kind: 'file', fileName: 'chart.json' } as const;

    let failure: Awaited<ReturnType<typeof result.current.loadText>>;
    await act(async () => {
      failure = await result.current.loadText(MINIMAL_TEXT, origin);
    });
    expect(failure).toMatchObject({ kind: 'conflict', name: 'chart.prompt-logic.json' });
    expect(result.current.document).toBeUndefined();

    await act(async () => {
      failure = await result.current.loadText(MINIMAL_TEXT, origin, { replace: true });
    });
    expect(failure).toBeUndefined();
    expect(result.current.document?.name).toBe('chart.prompt-logic.json');
  });

  it('opens the stored file that the URL names once the store returns it', async () => {
    globalThis.history.replaceState(null, '', '/?file=chart.prompt-logic.json');
    const { result } = renderDocumentState(createMemoryFileStore({ 'chart.prompt-logic.json': MINIMAL_TEXT }));

    expect(result.current.isOpening).toBe(true);
    await waitFor(() => expect(result.current.document?.name).toBe('chart.prompt-logic.json'));
    expect(result.current.isOpening).toBe(false);
  });

  it('reports a stored file that the store does not hold', async () => {
    const { result } = renderDocumentState();

    act(() => result.current.chooseStoredFile('gone.prompt-logic.json'));

    await waitFor(() => expect(result.current.report?.title).toBe('File not found'));
    expect(globalThis.location.search).toBe('?file=gone.prompt-logic.json');
  });

  it('returns from a document to the start page, and back to the document', async () => {
    const { result } = renderDocumentState();
    act(() => result.current.chooseExample(requireExample(changeApproval)));

    act(() => result.current.openStart());
    expect(result.current.document).toBeUndefined();
    expect(globalThis.location.search).toBe('');

    await navigateHistory(-1);
    expect(result.current.document?.name).toBe('Change approval');
  });

  it('moves back and forward among the start page, the examples, and uploaded documents', async () => {
    const { result } = renderDocumentState(createMemoryFileStore());
    act(() => result.current.chooseExample(requireExample(changeApproval)));
    act(() => result.current.chooseExample(requireExample(passwordReset)));
    act(() => result.current.openStart());
    await act(async () => {
      await result.current.loadText(MINIMAL_TEXT, { kind: 'file', fileName: 'first.json' });
    });
    act(() => result.current.openStart());
    await act(async () => {
      await result.current.loadText(MINIMAL_TEXT, { kind: 'paste' });
    });

    const names: Array<string | undefined> = [];
    for (let step = 0; step < 5; step += 1) {
      await navigateHistory(-1);
      await waitFor(() => expect(result.current.isOpening).toBe(false));
      names.push(result.current.document?.name);
    }
    expect(names).toEqual([undefined, 'first.prompt-logic.json', undefined, 'Password reset', 'Change approval']);

    await navigateHistory(3);
    await waitFor(() => expect(result.current.document?.name).toBe('first.prompt-logic.json'));
    expect(result.current.currentSlug).toBeUndefined();
  });

  it('reports an unknown example until a load clears it, whether the load succeeds or fails', async () => {
    globalThis.history.replaceState(null, '', '/?example=nope');
    const { result, announcements } = renderDocumentState();
    expect(result.current.unknownExample).toBe('nope');
    expect(announcements.at(-1)).toMatch(/nope/);

    await act(async () => {
      await result.current.loadText('not json', { kind: 'paste' });
    });

    expect(result.current.unknownExample).toBeUndefined();
  });

  it('shows the Visualizations table that the URL names', () => {
    globalThis.history.replaceState(null, '', '/?view=visualizations');

    const { result } = renderDocumentState();

    expect(result.current.isVisualizationsOpen).toBe(true);
    expect(result.current.document).toBeUndefined();
  });

  it('opens the Visualizations table under its own URL, and returns to it with back', async () => {
    const { result, announcements } = renderDocumentState();

    act(() => result.current.openVisualizations());

    expect(globalThis.location.search).toBe('?view=visualizations');
    expect(result.current.isVisualizationsOpen).toBe(true);
    expect(announcements.at(-1)).toBe('Opened All visualizations.');

    act(() => result.current.chooseExample(requireExample(changeApproval)));
    expect(result.current.isVisualizationsOpen).toBe(false);

    await navigateHistory(-1);
    expect(result.current.isVisualizationsOpen).toBe(true);
    expect(result.current.document).toBeUndefined();

    act(() => result.current.openStart());
    expect(result.current.isVisualizationsOpen).toBe(false);
    expect(globalThis.location.search).toBe('');
  });
});

// region | Helpers
/** Renders the hook on the store, collecting what it announces. */
function renderDocumentState(store: FileStore = createMemoryFileStore(), notJsonHint?: string) {
  const announcements: string[] = [];
  const announce = (text: string): void => {
    announcements.push(text);
  };
  const view = renderHook(() => useDocumentState({ fileStore: store, announce, notJsonHint }));
  return { ...view, announcements };
}

/** Returns the example, failing the test when the package does not bundle it. */
function requireExample<T>(example: T | undefined): T {
  if (example === undefined) throw new Error('Example not bundled');
  return example;
}
// endregion | Helpers
