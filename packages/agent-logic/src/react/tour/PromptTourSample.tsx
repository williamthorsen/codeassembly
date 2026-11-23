import type { ReactElement } from 'react';

import type { Coverage } from '../../source/prompt-segments.ts';

/**
 * Three lines of a prompt, each underlined as the prompt pane underlines its kind and named by the pane's label for it.
 * The lines take the pane's own mark classes, so that the sample cannot drift from the pane.
 */
export function PromptTourSample(): ReactElement {
  return (
    <ul aria-label="Three kinds of underlined text" className="prompt-key prompt-tour-sample">
      {SAMPLES.map(({ coverage, label, text }) => (
        <li key={coverage} className="prompt-key__entry prompt-tour-sample__entry">
          <span className={`prompt-key__sample prompt-key__sample--${coverage}`}>{text}</span>
          <span className="prompt-tour-sample__label">{label}</span>
        </li>
      ))}
    </ul>
  );
}

// region | Helpers
// In the order of the pane's key.
const SAMPLES: readonly {
  coverage: Extract<Coverage, 'ambient' | 'unconverted' | 'unused'>;
  label: string;
  text: string;
}[] = [
  { coverage: 'ambient', label: 'Ambient', text: 'Keep a friendly tone.' },
  { coverage: 'unused', label: 'Not used', text: 'You reset passwords for employees.' },
  { coverage: 'unconverted', label: 'Not converted', text: 'Usually offer a discount in December.' },
];
// endregion | Helpers
