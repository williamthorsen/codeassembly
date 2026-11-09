import { useCallback, useState } from 'react';

/** The `localStorage` key under which the viewer remembers whether flows show their preambles. */
export const SHOW_AMBIENT_KEY = 'agent-logic.show-ambient';

/**
 * Holds whether flows show their preambles of ambient instructions, remembered across loads and reloads; shown when
 * nothing is remembered or storage is unavailable.
 */
export function useShowAmbient(): [boolean, (isShown: boolean) => void] {
  const [isShown, setIsShown] = useState(readShowAmbient);
  const setShowAmbient = useCallback((next: boolean) => {
    setIsShown(next);
    try {
      globalThis.localStorage.setItem(SHOW_AMBIENT_KEY, String(next));
    } catch {
      // Keep the setting for this page only when storage refuses it.
    }
  }, []);
  return [isShown, setShowAmbient];
}

// region | Helpers
function readShowAmbient(): boolean {
  try {
    return globalThis.localStorage.getItem(SHOW_AMBIENT_KEY) !== 'false';
  } catch {
    return true;
  }
}
// endregion | Helpers
