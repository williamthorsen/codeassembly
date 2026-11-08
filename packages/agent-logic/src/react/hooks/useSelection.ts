import { useCallback, useState } from 'react';

import type { Span } from '../../schema/agent-logic-schema.ts';

/** The element selected and the passages shown, of which the page marks one at a time, and the calls that set them. */
export interface Selection {
  selectedPath: string | undefined;
  shownPassages: Span[];
  /** Selects an element, or clears the selection, and clears the passages shown. */
  select: (path: string | undefined) => void;
  /** Shows passages, such as an unconverted one or a finding's, and clears the selection. */
  showPassages: (passages: Span[]) => void;
  /** Clears both without publishing, for a new chart, whose load clears the agent's selection itself. */
  reset: () => void;
}

/**
 * Holds the page's one set of marked passages: a selected element's, or those that a message shows. Each change of the
 * selection goes to `publish`, so that the agent's session state follows it.
 */
export function useSelection(publish: (path: string | undefined) => void): Selection {
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [shownPassages, setShownPassages] = useState<Span[]>(NO_PASSAGES);

  const select = useCallback(
    (path: string | undefined) => {
      setShownPassages(NO_PASSAGES);
      setSelectedPath(path);
      publish(path);
    },
    [publish],
  );
  const showPassages = useCallback(
    (passages: Span[]) => {
      setSelectedPath(undefined);
      publish(undefined);
      setShownPassages(passages);
    },
    [publish],
  );
  const reset = useCallback(() => {
    setSelectedPath(undefined);
    setShownPassages(NO_PASSAGES);
  }, []);

  return { selectedPath, shownPassages, select, showPassages, reset };
}

// region | Helpers
/** The value of `shownPassages` when nothing is shown, shared so that the prompt's segments are not cut again. */
const NO_PASSAGES: Span[] = [];
// endregion | Helpers
