import type { ComponentType, ReactElement } from 'react';

import { type ConfigDescription, listGaps } from '../../layout/describe-config.ts';
import type { AgentLogicConfig, Span } from '../../schema/agent-logic-schema.ts';
import type { MessageCounts } from '../canvas/CanvasKey.tsx';
import type { ButtonProps, LinkButtonProps } from '../slots.ts';
import { FindingList } from './FindingList.tsx';
import { GapList } from './GapList.tsx';
import { UnconvertedPassages } from './UnconvertedPassages.tsx';

export interface MessagesProps {
  config: AgentLogicConfig;
  description: ConfigDescription;
  /** Receives the path of a state or transition named in the panel when it is clicked. */
  onSelect: (path: string) => void;
  /** Receives the passages of a finding or an unconverted passage to mark in the prompt. */
  onShow: (passages: Span[]) => void;
  /** The id that the toggle in the canvas key names as the panel that it controls. */
  id: string;
  isOpen: boolean;
  /** The app's button, which the panel renders for each disclosure and each "Show in prompt". */
  Button: ComponentType<ButtonProps>;
  /** The app's in-page link, which the panel renders, inline in its sentence, for each element that it names. */
  LinkButton: ComponentType<LinkButtonProps>;
}

/** Returns the number of each kind of message that a converted document has. */
export function countMessages(config: AgentLogicConfig, description: ConfigDescription): MessageCounts {
  return {
    gaps: listGaps(description).length,
    findings: description.findings.length,
    unconverted: config.meta.unconverted.length,
  };
}

/** Reports whether a document has any message to list. */
export function hasMessages({ gaps, findings, unconverted }: MessageCounts): boolean {
  return gaps + findings + unconverted > 0;
}

/**
 * The panel below the canvas of a converted document, of a fixed height and hidden until its toggle opens it: its
 * gaps, the converter's findings, and its unconverted passages.
 */
export function Messages({
  config,
  description,
  onSelect,
  onShow,
  id,
  isOpen,
  Button,
  LinkButton,
}: MessagesProps): ReactElement {
  const { prompt, unconverted } = config.meta;
  return (
    <section id={id} aria-label="Messages" hidden={!isOpen} className="statechart-messages">
      <GapList description={description} onSelect={onSelect} LinkButton={LinkButton} />
      <FindingList
        findings={description.findings}
        onSelect={onSelect}
        onShow={onShow}
        Button={Button}
        LinkButton={LinkButton}
      />
      <UnconvertedPassages
        prompt={prompt}
        passages={unconverted}
        onShow={(passage) => onShow([passage])}
        Button={Button}
      />
    </section>
  );
}
