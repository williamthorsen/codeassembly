import type { ReactElement } from 'react';

import type { ChartMark } from './list-chart-marks.ts';
import { FinalGlyph, InitialMark, NoExitGlyph, UnreachableGlyph, WaitGlyph } from './marks.tsx';

/** One entry of a canvas key: a kind of element that the chart marks, drawn as on the chart, with its gloss. */
export interface CanvasKeyEntry {
  id: ChartMark;
  /** The entry's name; absent when the mark is the word that the chart writes, which the entry does not repeat. */
  name?: string;
  /** What the mark means, for the entry's tooltip or description. */
  gloss: string;
  /** The mark as the chart draws it, styled by the package's stylesheet. */
  mark: ReactElement;
}

/** The entries of a canvas key, in the order in which a key lists them; a key shows those whose `id` the chart draws. */
export const CANVAS_KEY_ENTRIES: readonly CanvasKeyEntry[] = [
  {
    id: 'waits-for-user',
    name: 'Waits for user',
    gloss: 'The agent waits for the user here',
    mark: <WaitGlyph hasTitle={false} />,
  },
  { id: 'ends', name: 'Ends', gloss: 'The conversation ends here', mark: <FinalGlyph hasTitle={false} /> },
  {
    id: 'starts-here',
    name: 'Starts here',
    gloss: 'Starting state of its flow',
    mark: <InitialMark hasTitle={false} />,
  },
  {
    id: 'any-time',
    name: 'Any time',
    gloss: 'Applies throughout the flow',
    mark: <span className="canvas-key__swatch canvas-key__swatch--global" />,
  },
  {
    id: 'inferred',
    gloss: 'Not stated in the prompt',
    mark: (
      <>
        <span className="canvas-key__swatch canvas-key__swatch--inferred" />
        <i className="canvas-key__word">inferred</i>
      </>
    ),
  },
  {
    id: 'gate',
    gloss: 'Marked as a hard gate in the prompt',
    mark: <i className="canvas-key__word">gate</i>,
  },
  {
    id: 'fallback',
    name: 'Fallback',
    gloss: 'Taken when no guarded sibling applies',
    mark: <i className="canvas-key__word">otherwise</i>,
  },
  {
    id: 'no-exit',
    name: 'No exit',
    gloss: 'Not an end, and nothing of its own leads on',
    mark: <NoExitGlyph hasTitle={false} />,
  },
  { id: 'unreachable', name: 'Unreachable', gloss: 'Nothing leads to it', mark: <UnreachableGlyph hasTitle={false} /> },
  {
    id: 'no-alternative',
    gloss: 'A condition with nothing for when it does not hold',
    mark: <i className="canvas-key__word">no alternative</i>,
  },
];
