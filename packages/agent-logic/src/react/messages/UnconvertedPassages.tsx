import { type ComponentType, type ReactElement, useId, useState } from 'react';

import type { UnconvertedSpan } from '../../schema/agent-logic-schema.ts';
import type { ButtonProps } from '../slots.ts';
import { abbreviate } from './abbreviate.ts';
import { ChevronIcon } from './icons.tsx';
import { SectionMessage } from './SectionMessage.tsx';

export interface UnconvertedPassagesProps {
  prompt: string;
  passages: UnconvertedSpan[];
  /** Receives the passage whose button was clicked, to show it in the prompt. */
  onShow: (passage: UnconvertedSpan) => void;
  Button: ComponentType<ButtonProps>;
}

/**
 * The passages of the prompt that the converter could not turn into logic, quoted with the reason for each, under a
 * disclosure that counts them. The list starts collapsed, because the prompt pane marks the same passages.
 */
export function UnconvertedPassages({
  prompt,
  passages,
  onShow,
  Button,
}: UnconvertedPassagesProps): ReactElement | undefined {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  if (passages.length === 0) return undefined;
  return (
    <SectionMessage
      appearance="warning"
      title={
        <Button aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setIsOpen((wasOpen) => !wasOpen)}>
          <ChevronIcon isOpen={isOpen} />
          Unconverted passages ({passages.length})
        </Button>
      }
    >
      <div id={detailsId} hidden={!isOpen} className="statechart-messages__details">
        <p>
          Absent from the chart. To convert one, rewrite it as a step, a condition, or a rule that applies in every
          state, then convert the prompt again.
        </p>
        <ul className="statechart-messages__passages">
          {passages.map((passage) => {
            const text = prompt.slice(passage.start, passage.end);
            return (
              <li key={`${passage.start}-${passage.end}`}>
                <Button aria-label={`Show in prompt: ${abbreviate(text)}`} onClick={() => onShow(passage)}>
                  Show in prompt
                </Button>{' '}
                <q className="statechart-messages__quote">{text}</q>
                {passage.reason === undefined ? undefined : ` ${passage.reason}`}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionMessage>
  );
}
