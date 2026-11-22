import { act } from '@testing-library/react';

/** Moves through the session history by `delta` entries and waits for the page to handle the `popstate` event. */
export async function navigateHistory(delta: number): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((resolve) => {
      globalThis.addEventListener('popstate', () => resolve(), { once: true });
    });
    globalThis.history.go(delta);
    await popped;
  });
}
