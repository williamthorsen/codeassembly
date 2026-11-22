import type { ComponentType, ReactElement } from 'react';

import {
  type ConfigDescription,
  listGaps,
  nameElement,
  type StateDescription,
  type TransitionDescription,
} from '../../layout/describe-config.ts';
import type { LinkButtonProps } from '../slots.ts';
import { SectionMessage } from './SectionMessage.tsx';

export interface GapListProps {
  description: ConfigDescription;
  /** Receives the path of a listed state or transition when its name is clicked. */
  onSelect: (path: string) => void;
  LinkButton: ComponentType<LinkButtonProps>;
}

/**
 * The states without an exit, the unreachable states, and the conditions without an alternative of a loaded config,
 * each of which selects its element.
 */
export function GapList({ description, onSelect, LinkButton }: GapListProps): ReactElement | undefined {
  const gaps = listGaps(description);
  if (gaps.length === 0) return undefined;
  return (
    <SectionMessage appearance="warning" title="Gaps in the logic">
      <ul className="statechart-messages__list">
        {gaps.map((gap) => (
          <li key={gap.path}>
            <LinkButton isInline onClick={() => onSelect(gap.path)}>
              {nameElement(gap)}
            </LinkButton>{' '}
            {describeGap(gap)}
          </li>
        ))}
      </ul>
    </SectionMessage>
  );
}

// region | Helpers
/** Returns the kind of each gap of an element and what it leaves unstated. */
function describeGap(gap: StateDescription | TransitionDescription): string {
  if (gap.kind === 'transition') {
    return `No alternative. Only if ${gap.guard ?? ''}. The prompt does not say what happens otherwise.`;
  }
  return [
    ...(gap.hasNoExit ? ['No exit. Not an end, and none of its own transitions leads to another state.'] : []),
    ...(gap.isUnreachable ? ['Unreachable. No transition leads to it, and no flow starts with it.'] : []),
  ].join(' ');
}
// endregion | Helpers
