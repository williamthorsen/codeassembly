import { type ReactElement, type ReactNode, useId } from 'react';

import { InformationIcon, WarningIcon } from './icons.tsx';

export interface SectionMessageProps {
  /** `warning` for what needs the reader's attention; `information` for what only informs. */
  appearance: 'information' | 'warning';
  /** The heading; a node rather than text so that it can hold a control, such as a disclosure. */
  title: ReactNode;
  children?: ReactNode;
}

/** A tinted section with the icon of its appearance beside a heading and its body. */
export function SectionMessage({ appearance, title, children }: SectionMessageProps): ReactElement {
  const titleId = useId();
  const Icon = appearance === 'information' ? InformationIcon : WarningIcon;
  return (
    <section
      aria-labelledby={titleId}
      className={`statechart-messages__section statechart-messages__section--${appearance}`}
    >
      <Icon />
      <div className="statechart-messages__section-body">
        <h2 id={titleId} className="statechart-messages__section-title">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
