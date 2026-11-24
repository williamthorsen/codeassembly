import { type ReactElement, type ReactNode, useEffect, useId, useState } from 'react';

export interface GlossedLabelProps {
  label: ReactNode;
  /** What the label means, shown on hover and focus and read as the label's description. */
  gloss: string;
  /** The side of the label on which the gloss opens. */
  placement?: 'above' | 'below';
}

/**
 * A label that explains itself: focusable so that a keyboard user reaches its gloss, which shows on hover and focus,
 * stays while the pointer is over it, and closes on Escape until the pointer or focus leaves. Escape that closes the
 * gloss is marked as handled, so that `useEscapeToClear` keeps the selection.
 */
export function GlossedLabel({ label, gloss, placement = 'above' }: GlossedLabelProps): ReactElement {
  const glossId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // A hovered label without focus does not receive key events, so Escape is heard on the document while hovered. The
  // capture phase marks the key as taken before `useEscapeToClear` hears it.
  useEffect(() => {
    if (!isHovered || isDismissed) return;
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsDismissed(true);
    }
    document.addEventListener('keydown', dismissOnEscape, { capture: true });
    return () => document.removeEventListener('keydown', dismissOnEscape, { capture: true });
  }, [isHovered, isDismissed]);

  return (
    <span
      className={`gloss gloss--${placement}`}
      data-dismissed={isDismissed ? '' : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsDismissed(false);
      }}
      onBlur={() => setIsDismissed(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isDismissed) return;
        event.preventDefault();
        setIsDismissed(true);
      }}
    >
      <span tabIndex={0} aria-describedby={glossId} className="gloss__label">
        {label}
      </span>
      <span id={glossId} role="tooltip" className="gloss__tooltip">
        <span className="gloss__text">{gloss}</span>
      </span>
    </span>
  );
}
