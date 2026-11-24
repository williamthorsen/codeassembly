import { type ComponentType, type ReactElement, useId } from 'react';

import { GlossedLabel } from '../gloss/GlossedLabel.tsx';
import { ChevronIcon } from '../messages/icons.tsx';
import type { ButtonProps } from '../slots.ts';
import { CANVAS_KEY_ENTRIES, type CanvasKeyEntry } from './canvas-key-entries.tsx';
import type { ChartMark } from './list-chart-marks.ts';

/** The state of the control that shows and hides every flow's preamble of ambient instructions. */
export interface AmbientToggle {
  /** The number of ambient instructions in the chart, which the control's label states. */
  count: number;
  isShown: boolean;
  onChange: (isShown: boolean) => void;
}

export interface CanvasKeyProps {
  /** The marks that the chart draws; the key names only these. */
  marks: ReadonlySet<ChartMark>;
  ambientToggle?: AmbientToggle | undefined;
  messagesToggle?: MessagesToggle | undefined;
  /** The app's button, which the key renders as the toggle of the messages panel. */
  Button: ComponentType<ButtonProps>;
}

/** The numbers of each kind of message that a document has. */
export interface MessageCounts {
  gaps: number;
  findings: number;
  unconverted: number;
}

/** The state of the control that opens and closes the messages panel below the canvas. */
export interface MessagesToggle {
  counts: MessageCounts;
  isOpen: boolean;
  onToggle: () => void;
  /** The id of the panel that the control opens. */
  panelId: string;
}

/**
 * The canvas's key, a strip below the chart: each kind of element that the chart marks, drawn as on the chart, with its
 * gloss on hover and focus, then the control that shows and hides the preambles when the chart has ambient
 * instructions, and the toggle of the messages panel when the document has messages.
 */
export function CanvasKey({ marks, ambientToggle, messagesToggle, Button }: CanvasKeyProps): ReactElement | undefined {
  const entries = CANVAS_KEY_ENTRIES.filter(({ id }) => marks.has(id));
  if (entries.length === 0 && ambientToggle === undefined && messagesToggle === undefined) return undefined;
  return (
    <div className="canvas-key">
      <ul aria-label="Key" className="canvas-key__entries">
        {entries.map((entry) => (
          <KeyEntry key={entry.id} entry={entry} />
        ))}
      </ul>
      <div className="canvas-key__controls">
        {ambientToggle === undefined ? undefined : <AmbientToggleControl {...ambientToggle} />}
        {messagesToggle === undefined ? undefined : <MessagesToggleControl {...messagesToggle} Button={Button} />}
      </div>
    </div>
  );
}

// region | Helpers

/** The labelled checkbox that shows and hides every flow's preamble. */
function AmbientToggleControl({ count, isShown, onChange }: AmbientToggle): ReactElement {
  const inputId = useId();
  return (
    <div className="canvas-key__ambient">
      <input
        id={inputId}
        type="checkbox"
        checked={isShown}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {/* The prompt pane's mark for ambient text, so that the key shows ambient's colour. */}
      <label htmlFor={inputId} className="prompt-key__sample--ambient">
        Ambient instructions ({count})
      </label>
    </div>
  );
}

/** Returns the counts of the kinds of message that a document has, such as "3 gaps · 1 finding". */
function formatCounts({ gaps, findings, unconverted }: MessageCounts): string {
  const kinds: [count: number, singular: string, plural: string][] = [
    [gaps, 'gap', 'gaps'],
    [findings, 'finding', 'findings'],
    [unconverted, 'unconverted', 'unconverted'],
  ];
  return kinds
    .filter(([count]) => count !== 0)
    .map(([count, singular, plural]) => `${count} ${count === 1 ? singular : plural}`)
    .join(' · ');
}

/** One entry of the key: its mark and name, glossed. */
function KeyEntry({ entry: { name, gloss, mark } }: { entry: CanvasKeyEntry }): ReactElement {
  return (
    <li className="canvas-key__entry">
      <GlossedLabel
        label={
          <>
            {mark}
            {name}
          </>
        }
        gloss={gloss}
      />
    </li>
  );
}

/** The button that opens and closes the messages panel, followed by the counts that the panel lists. */
function MessagesToggleControl({
  counts,
  isOpen,
  onToggle,
  panelId,
  Button,
}: MessagesToggle & { Button: ComponentType<ButtonProps> }): ReactElement {
  const countsId = useId();
  return (
    <div className="canvas-key__messages">
      <Button aria-expanded={isOpen} aria-controls={panelId} aria-describedby={countsId} onClick={onToggle}>
        <ChevronIcon isOpen={isOpen} />
        Messages
      </Button>
      <span id={countsId} className="canvas-key__counts">
        {formatCounts(counts)}
      </span>
    </div>
  );
}

// endregion | Helpers
