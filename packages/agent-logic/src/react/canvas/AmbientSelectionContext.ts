import { createContext } from 'react';

/** What a flow's preamble needs to mark its selected entry and to select one: the canvas's selection and its setter. */
export interface AmbientSelection {
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}

/** The canvas's selection, for the ambient instructions that React Flow's node selection does not reach. */
export const AmbientSelectionContext = createContext<AmbientSelection>({
  selectedPath: undefined,
  onSelect: () => {},
});
