import type { ReactElement } from 'react';

export interface GlyphProps {
  /** Whether the glyph names itself in a title; false where a label beside it already names it. */
  hasTitle?: boolean;
}

/** The 16px glyph of a state that waits for the user: a speech bubble. */
export function WaitGlyph({ hasTitle = true }: GlyphProps): ReactElement {
  return (
    <svg className="mark-glyph mark-glyph--wait" viewBox="0 0 16 16" aria-hidden="true">
      {hasTitle ? <title>Waits for user</title> : undefined}
      <path
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H7l-3.5 3v-3A1.5 1.5 0 0 1 2 9.5z"
        fill="currentColor"
      />
      <circle cx="5.5" cy="6.5" r="1" className="mark-glyph__cutout" />
      <circle cx="8" cy="6.5" r="1" className="mark-glyph__cutout" />
      <circle cx="10.5" cy="6.5" r="1" className="mark-glyph__cutout" />
    </svg>
  );
}

/** The 16px glyph of a final state: a ring around a dot. */
export function FinalGlyph({ hasTitle = true }: GlyphProps): ReactElement {
  return (
    <svg className="mark-glyph mark-glyph--final" viewBox="0 0 16 16" aria-hidden="true">
      {hasTitle ? <title>Ends</title> : undefined}
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** The 16px glyph of a state that is not final and that none of its own transitions leaves: a barred circle. */
export function NoExitGlyph({ hasTitle = true }: GlyphProps): ReactElement {
  return (
    <svg className="mark-glyph mark-glyph--no-exit" viewBox="0 0 16 16" aria-hidden="true">
      {hasTitle ? <title>No exit</title> : undefined}
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <rect x="3.5" y="6.75" width="9" height="2.5" rx="0.5" className="mark-glyph__cutout" />
    </svg>
  );
}

/** The 16px glyph of a state that nothing enters: a dashed ring. */
export function UnreachableGlyph({ hasTitle = true }: GlyphProps): ReactElement {
  return (
    <svg className="mark-glyph mark-glyph--unreachable" viewBox="0 0 16 16" aria-hidden="true">
      {hasTitle ? <title>Unreachable</title> : undefined}
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3.5 2.78" />
    </svg>
  );
}

/** The 22×12px mark that points into the state in which a flow starts: a dot and an arrow. */
export function InitialMark({ className, hasTitle = true }: GlyphProps & { className?: string }): ReactElement {
  return (
    <svg
      className={['mark-initial', className].filter(Boolean).join(' ')}
      viewBox="0 0 22 12"
      width="22"
      height="12"
      aria-hidden="true"
    >
      {hasTitle ? <title>Starts here</title> : undefined}
      <circle cx="5" cy="6" r="4.5" fill="currentColor" />
      <path d="M9 6h8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2.5L21.5 6L16 9.5z" fill="currentColor" />
    </svg>
  );
}

/** The arrowheads of the canvas's transitions, one per edge colour, which `styles.css` assigns to each edge's path. */
export function ArrowheadDefs(): ReactElement {
  return (
    <svg className="arrowhead-defs" width="0" height="0" aria-hidden="true">
      <defs>
        {ARROWHEADS.map(({ id, size }) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={size}
            markerHeight={size}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`arrowhead arrowhead--${id}`} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

// region | Helpers
const ARROWHEADS = [
  { id: 'arrowhead-global', size: 11 },
  { id: 'arrowhead-ordinary', size: 9 },
  { id: 'arrowhead-selected', size: 11 },
];
// endregion | Helpers
