import type { ReactElement } from 'react';

import type { Coverage } from '../../source/prompt-segments.ts';
import { GlossedLabel } from '../gloss/GlossedLabel.tsx';

/** The key of the prompt pane's marks, each name drawn with the mark that it names and glossed. */
export function PromptKey(): ReactElement {
  return (
    <ul aria-label="Prompt marks" className="prompt-key">
      {KEY_ENTRIES.map(({ coverage, label, gloss }) => (
        <li key={coverage} className="prompt-key__entry">
          <GlossedLabel
            label={<span className={`prompt-key__sample prompt-key__sample--${coverage}`}>{label}</span>}
            gloss={gloss}
          />
        </li>
      ))}
    </ul>
  );
}

// region | Helpers
// Used text and structure are unmarked, so the key names only the exceptions.
const KEY_ENTRIES: readonly { coverage: Exclude<Coverage, 'structure' | 'used'>; label: string; gloss: string }[] = [
  { coverage: 'ambient', label: 'Ambient', gloss: 'Applies throughout its flow rather than at one state' },
  { coverage: 'unused', label: 'Not used', gloss: 'Text without any logic to draw' },
  { coverage: 'unconverted', label: 'Not converted', gloss: 'Logic that a chart cannot express; review each one' },
  { coverage: 'comment', label: 'Comment', gloss: 'An HTML comment, which the chart does not draw' },
];
// endregion | Helpers
