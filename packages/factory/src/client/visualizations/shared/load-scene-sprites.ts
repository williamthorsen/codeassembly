/**
 * Awaits a scene's sprite load, logging a failure under the given message rather than propagating
 * it. A scene that fails to load its sprites still renders, with fallback or empty graphics.
 */
export async function loadSceneSprites(load: () => Promise<void>, failureMessage: string): Promise<void> {
  try {
    await load();
  } catch (error: unknown) {
    console.error(failureMessage, error);
  }
}
