import type { ReactElement } from 'react';

/** The glyph of a disclosure: a chevron that points right while closed and down while open. */
export function ChevronIcon({ isOpen }: { isOpen: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className={`statechart-chevron${isOpen ? ' statechart-chevron--open' : ''}`}
    >
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}

/** The glyph of information: a filled circle holding an `i`. */
export function InformationIcon(): ReactElement {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="statechart-messages__icon">
      <circle cx="10" cy="10" r="8" fill="currentColor" />
      <path d="M10 9v5" className="statechart-messages__icon-stroke" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="1.1" className="statechart-messages__icon-fill" />
    </svg>
  );
}

/** The glyph of a warning: a filled triangle holding an exclamation mark. */
export function WarningIcon(): ReactElement {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="statechart-messages__icon">
      <path
        d="M8.27 3.2a2 2 0 0 1 3.46 0l6.1 10.55A2 2 0 0 1 16.1 16.75H3.9a2 2 0 0 1-1.73-3L8.27 3.2Z"
        fill="currentColor"
      />
      <path d="M10 7.5v3.75" className="statechart-messages__icon-stroke" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="13.75" r="1.1" className="statechart-messages__icon-fill" />
    </svg>
  );
}
