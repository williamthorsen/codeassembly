import { BaseEdge, type EdgeProps } from '@xyflow/react';
import type { ReactElement } from 'react';

import { buildTransitionLabel, type TransitionLabel } from '../../layout/describe-config.ts';
import type { TransitionFlowEdge } from '../../layout/to-flow-elements.ts';

/** A transition on the canvas, drawn along the route that ELK computed, with its trigger, guard, actions, and kind words as its label. */
export function TransitionEdge({
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<TransitionFlowEdge>): ReactElement {
  const points =
    data !== undefined && data.points.length >= 2
      ? data.points
      : [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ];
  const path = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const classNames = [
    'transition-edge__path',
    data?.isGlobal === true ? 'transition-edge__path--global' : undefined,
    data?.inferred === true ? 'transition-edge__path--inferred' : undefined,
  ];

  return (
    <>
      <BaseEdge path={path} className={classNames.filter(Boolean).join(' ')} interactionWidth={16} />
      {data?.labelBox === undefined ? undefined : (
        <foreignObject
          x={data.labelBox.x}
          y={data.labelBox.y}
          width={data.labelBox.width}
          height={data.labelBox.height}
        >
          <div className="transition-edge__label" data-path={data.path}>
            <TransitionLabelLines {...buildTransitionLabel(data)} />
          </div>
        </foreignObject>
      )}
    </>
  );
}

// region | Helpers
// Lines that name a kind of transition rather than state its trigger, guard, or actions.
const WORD_LINES = new Set(['always', 'gate', 'inferred', 'no alternative', 'otherwise']);

/** A transition label's lines: the trigger set as an identifier, then the prose lines. */
function TransitionLabelLines({ trigger, details }: TransitionLabel): ReactElement {
  return (
    <>
      {trigger === undefined ? undefined : <div className="transition-edge__trigger">{trigger}</div>}
      {details.map((line) => (
        <div key={line} className={WORD_LINES.has(line) ? 'transition-edge__word' : undefined}>
          {line}
        </div>
      ))}
    </>
  );
}
// endregion | Helpers
