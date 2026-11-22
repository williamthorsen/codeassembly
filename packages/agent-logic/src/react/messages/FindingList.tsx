import type { ComponentType, ReactElement } from 'react';

import { type FindingDescription, nameElement } from '../../layout/describe-config.ts';
import type { FindingKind, Span } from '../../schema/agent-logic-schema.ts';
import type { ButtonProps, LinkButtonProps } from '../slots.ts';
import { abbreviate } from './abbreviate.ts';
import { SectionMessage } from './SectionMessage.tsx';

export interface FindingListProps {
  findings: FindingDescription[];
  /** Receives the path of the element that a finding concerns when its name is clicked. */
  onSelect: (path: string) => void;
  /** Receives the quoted passages of a finding on the root when its button is clicked, to mark them in the prompt. */
  onShow: (passages: Span[]) => void;
  Button: ComponentType<ButtonProps>;
  LinkButton: ComponentType<LinkButtonProps>;
}

/**
 * The flaws that the converter judged from the prompt's prose, kept apart from the gaps that the chart's structure
 * shows. Each selects the element that it concerns or, for a finding on the root, marks its quotes in the prompt.
 */
export function FindingList({
  findings,
  onSelect,
  onShow,
  Button,
  LinkButton,
}: FindingListProps): ReactElement | undefined {
  if (findings.length === 0) return undefined;
  return (
    <SectionMessage appearance="information" title={`Converter’s findings (${findings.length})`}>
      <p>Judged by the model that converted the prompt, not checked against the chart.</p>
      <ul className="statechart-messages__list">
        {findings.map(({ path, kind, reason, sources, element }) => (
          <li key={path}>
            <span className="statechart-messages__kind">{KIND_LABELS[kind]}</span>
            {reason}{' '}
            {element === undefined ? (
              <Button aria-label={`Show in prompt: ${abbreviate(reason)}`} onClick={() => onShow(sources)}>
                Show in prompt
              </Button>
            ) : (
              <LinkButton isInline onClick={() => onSelect(element.path)}>
                {nameElement(element)}
              </LinkButton>
            )}
          </li>
        ))}
      </ul>
    </SectionMessage>
  );
}

// region | Helpers
const KIND_LABELS: Record<FindingKind, string> = {
  contradiction: 'Contradiction',
  'inferred-resolution': 'Ambiguity resolved',
  'unhandled-case': 'Unhandled case',
  'unused-input': 'Unused input',
};
// endregion | Helpers
