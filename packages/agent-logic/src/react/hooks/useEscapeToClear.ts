import { useEffect } from 'react';

/** Calls `clear` when Escape is pressed, except where an open dialog takes the key to close itself. */
export function useEscapeToClear(clear: () => void): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== null) return;
      clear();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clear]);
}
