import { useCallback, useEffect, useState } from 'react';

import { describeUnknownExample } from './describe-load-outcome.ts';
import { findUnknownExampleInSearch } from './example-location.ts';

/** The `example` value of the URL when it names no bundled example, and the function that clears it after a load. */
export interface UnknownExample {
  unknownExample: string | undefined;
  clearUnknownExample: () => void;
}

/** Tracks an unknown `example` value in the URL, announcing it on the first load and after each move through history. */
export function useUnknownExample(announce: (text: string) => void): UnknownExample {
  const [unknownExample, setUnknownExample] = useState(() => findUnknownExampleInSearch(globalThis.location.search));

  useEffect(() => {
    announceIfUnknown(findUnknownExampleInSearch(globalThis.location.search));
    globalThis.addEventListener('popstate', handlePopState);
    return () => {
      globalThis.removeEventListener('popstate', handlePopState);
    };

    function handlePopState(): void {
      const value = findUnknownExampleInSearch(globalThis.location.search);
      setUnknownExample(value);
      announceIfUnknown(value);
    }

    function announceIfUnknown(value: string | undefined): void {
      if (value !== undefined) announce(describeUnknownExample(value));
    }
  }, [announce]);

  const clearUnknownExample = useCallback(() => {
    setUnknownExample(undefined);
  }, []);
  return { unknownExample, clearUnknownExample };
}
