import { type MouseEvent, type ReactElement, type ReactNode, useEffect, useId, useRef } from 'react';

import type { ElementDescription } from '../../layout/describe-config.ts';
import type { Span } from '../../schema/agent-logic-schema.ts';
import { type Coverage, listElementWords, type PromptSegment } from '../../source/prompt-segments.ts';
import { PromptKey } from './PromptKey.tsx';

export interface PromptPaneProps {
  segments: PromptSegment[];
  selected: ElementDescription | undefined;
  /** The passages to mark, the earliest of which is brought into view; the segments must be cut at their bounds. */
  shownPassages?: Span[] | undefined;
  /** Receives the path of the element whose passage was clicked. */
  onSelect: (path: string) => void;
}

/**
 * The whole prompt with its key, marking the text that the chart does not use, with the selected element's or the
 * shown passages highlighted. Its text region has `data-prompt-text`, and each passage `data-coverage`; a selected
 * passage has `data-selected`, the first of them `data-passage-for` with the element's path, a shown passage
 * `data-shown`, the earliest of them `data-shown-passage`, and a passage that selects an element `data-select-path`.
 */
export function PromptPane({ segments, selected, shownPassages = [], onSelect }: PromptPaneProps): ReactElement {
  const headingId = useId();
  const textRef = useRef<HTMLDivElement>(null);
  const selectedPath = selected?.path;
  const sharedWords = selected === undefined ? new Set<string>() : listElementWords(selected);
  const firstSelectedStart = segments.find(
    ({ paths }) => selectedPath !== undefined && paths.includes(selectedPath),
  )?.start;
  const firstShownStart = Math.min(...shownPassages.map(({ start }) => start));
  const shownKey = shownPassages.map(({ start, end }) => `${start}-${end}`).join(',');

  // Bring the passage into view unless its first line already is.
  useEffect(() => {
    const container = textRef.current;
    const passage = container?.querySelector('[data-passage-for], [data-shown-passage]');
    const firstLine = passage?.getClientRects()[0];
    if (container === null || firstLine === undefined) return;
    const bounds = container.getBoundingClientRect();
    if (firstLine.top >= bounds.top && firstLine.bottom <= bounds.bottom) return;
    container.scrollTop += firstLine.top - bounds.top - container.clientHeight * 0.3;
  }, [selectedPath, shownKey]);

  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    if (!(event.target instanceof Element)) return;
    const path = event.target.closest<HTMLElement>('[data-select-path]')?.dataset['selectPath'];
    if (path !== undefined) onSelect(path);
  }

  return (
    <section aria-labelledby={headingId} className="prompt-pane">
      <div className="prompt-pane__header">
        <h2 id={headingId} className="prompt-pane__heading">
          Prompt
        </h2>
        <PromptKey />
      </div>
      {/* Passages are pointer shortcuts; keyboard users select through the canvas, the messages, and the inspector. */}
      <div ref={textRef} onClick={handleClick} data-prompt-text="" className="prompt-pane__text">
        {segments.map((segment) => {
          const isShown = shownPassages.some(({ start, end }) => segment.start >= start && segment.end <= end);
          const isSelected = selectedPath !== undefined && segment.paths.includes(selectedPath);
          const selectPath =
            segment.coverage === 'used'
              ? segment.paths[0]
              : segment.coverage === 'ambient'
                ? segment.paths.find((path) => AMBIENT_PATH.test(path))
                : undefined;
          return (
            <span
              key={segment.start}
              className={classifyPassage(segment.coverage, isSelected || isShown)}
              data-coverage={segment.coverage}
              data-selected={isSelected ? '' : undefined}
              data-shown={isShown ? '' : undefined}
              data-select-path={selectPath}
              data-passage-for={isSelected && segment.start === firstSelectedStart ? selectedPath : undefined}
              data-shown-passage={isShown && segment.start === firstShownStart ? '' : undefined}
            >
              {isSelected ? boldSharedWords(segment.text, sharedWords) : segment.text}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// region | Helpers
// The path of an ambient instruction, which a passage in the prompt selects ahead of any element inside it.
const AMBIENT_PATH = /(?:^|\.)meta\.ambient\[\d+\]$/;

/** Sets in bold each word of the text that the selected element also uses. */
function boldSharedWords(text: string, words: Set<string>): ReactNode[] {
  return text
    .split(/([A-Za-z0-9]+)/)
    .map((part, index) => (words.has(part.toLowerCase()) ? <b key={index}>{part}</b> : part));
}

/** Returns the classes of a passage by its coverage, highlighted when selected or shown. */
function classifyPassage(coverage: Coverage, isHighlighted: boolean): string {
  const classes = `prompt-pane__passage prompt-pane__passage--${coverage}`;
  return isHighlighted ? `${classes} prompt-pane__passage--highlighted` : classes;
}
// endregion | Helpers
