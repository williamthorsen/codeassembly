import type { ReactElement } from 'react';

import type { Coverage } from '../../source/prompt-segments.ts';

/** The key of the prompt pane's marks, each name drawn with the mark that it names. */
export function PromptKey(): ReactElement {
  return (
    <ul aria-label="Prompt marks" className="prompt-key">
      {KEY_ENTRIES.map(({ coverage, label }) => (
        <li key={coverage} className="prompt-key__entry">
          <span className={`prompt-key__sample prompt-key__sample--${coverage}`}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

// region | Helpers
// Used text and structure are unmarked, so the key names only the exceptions.
const KEY_ENTRIES: readonly { coverage: Exclude<Coverage, 'structure' | 'used'>; label: string }[] = [
  { coverage: 'ambient', label: 'Ambient' },
  { coverage: 'unused', label: 'Not used' },
  { coverage: 'unconverted', label: 'Not converted' },
  { coverage: 'comment', label: 'Comment' },
];
// endregion | Helpers
