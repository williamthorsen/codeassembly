import { Handle, type NodeProps, NodeToolbar, Position, useStore } from '@xyflow/react';
import { type CSSProperties, type ReactElement, type RefObject, useContext, useEffect, useRef, useState } from 'react';

import { MAX_ACTION_LINES, MAX_AMBIENT_LINES, MAX_CARD_ACTIONS, PREAMBLE_WIDTH } from '../../layout/card-limits.ts';
import type { ActionDescription } from '../../layout/describe-config.ts';
import { PREAMBLE_COLUMN_GAP } from '../../layout/pack-preamble.ts';
import type { StateFlowNode, StateNodeData } from '../../layout/to-flow-elements.ts';
import { AmbientSelectionContext } from './AmbientSelectionContext.ts';
import { DetailLevelContext } from './DetailLevelContext.ts';
import { FinalGlyph, InitialMark, NoExitGlyph, UnreachableGlyph, WaitGlyph } from './marks.tsx';
import { type FlowNamePlacement, placeFlowNames } from './zoom-levels.ts';

/** A state on the canvas: a container named above its top edge for a compound state, a titled card for any other, each with its kind's marks. */
export function StateNode({ data }: NodeProps<StateFlowNode>): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isPointedAt = useIsPointedAt(ref);
  const isBox = useContext(DetailLevelContext) === 'shapes' && !data.isCompound;
  const { shift: nameShift, isShown: isNameShown } = useNamePlacement(data);
  const classNames = [
    'state-node',
    data.isCompound ? 'state-node--compound' : undefined,
    data.isFinal ? 'state-node--final' : undefined,
    data.inferred ? 'state-node--inferred' : undefined,
    data.waitsForUser ? 'state-node--waiting' : undefined,
  ];

  return (
    <div ref={ref} className={classNames.filter(Boolean).join(' ')} data-path={data.path}>
      <NodeToolbar isVisible={(isBox || !isNameShown) && isPointedAt} position={Position.Top} offset={6}>
        <div className="state-node__tooltip" role="tooltip">
          {data.name}
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} isConnectable={false} className="state-node__handle" />
      {data.isInitial ? <InitialMark className="state-node__initial-mark" /> : undefined}
      {data.isCompound ? (
        <FlowName name={data.name} shift={nameShift} isShown={isNameShown} />
      ) : (
        <div className="state-node__title-row">
          <div className="state-node__title">{data.name}</div>
          {data.waitsForUser || data.isFinal || data.hasNoExit || data.isUnreachable ? (
            <div className="state-node__glyphs">
              {data.waitsForUser ? <WaitGlyph /> : undefined}
              {data.isFinal ? <FinalGlyph /> : undefined}
              {data.hasNoExit ? <NoExitGlyph /> : undefined}
              {data.isUnreachable ? <UnreachableGlyph /> : undefined}
            </div>
          ) : undefined}
        </div>
      )}
      <Preamble flowName={data.name} ambient={data.ambient} layout={data.preambleLayout} />
      {data.inferred ? <div className="state-node__inferred">inferred</div> : undefined}
      <ActionList heading="Does" actions={data.entry} />
      <ActionList heading="On exit" actions={data.exit} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="state-node__handle" />
    </div>
  );
}

// region | Helpers
/** A headed list of a state's first actions, each clamped, and a count of the rest; absent when the state has none. */
function ActionList({ heading, actions }: { heading: string; actions: ActionDescription[] }): ReactElement | undefined {
  if (actions.length === 0) return undefined;
  return (
    <div className="state-node__actions">
      <div className="state-node__actions-heading">{heading}</div>
      <ul>
        {actions.slice(0, MAX_CARD_ACTIONS).map(({ text, gate }) => (
          <li key={text} className="state-node__action" style={{ WebkitLineClamp: MAX_ACTION_LINES }}>
            {gate ? <GateWord /> : undefined}
            {text}
          </li>
        ))}
      </ul>
      {actions.length > MAX_CARD_ACTIONS ? (
        <div className="state-node__more">{describeHiddenActions(actions.slice(MAX_CARD_ACTIONS))}</div>
      ) : undefined}
    </div>
  );
}

/** Counts the actions that a card leaves out, naming how many of them are gates. */
function describeHiddenActions(hidden: ActionDescription[]): string {
  const gates = hidden.filter(({ gate }) => gate).length;
  if (gates === 0) return `${hidden.length} more`;
  return `${hidden.length} more, including ${gates} ${gates === 1 ? 'gate' : 'gates'}`;
}

/** Returns where a flow's name sits at a zoom; absent for a leaf. */
function findNamePlacement(data: StateNodeData, zoom: number): FlowNamePlacement | undefined {
  return data.flowNameSites === undefined ? undefined : placeFlowNames(data.flowNameSites, zoom).get(data.id);
}

/** A flow's name above its top edge, moved right by a shift, or the band inside its top edge while it is not shown. */
function FlowName({ name, shift, isShown }: { name: string } & FlowNamePlacement): ReactElement {
  return (
    <div
      className={isShown ? 'state-node__flow-name' : 'state-node__flow-name state-node__flow-name--hidden'}
      // The band's tooltip is the node's, so only a shown name, which may be truncated, takes a title.
      title={isShown ? name : undefined}
      style={shift > 0 ? { translate: `${shift}px 0` } : undefined}
    >
      {name}
    </div>
  );
}

/** The word that marks a gated action or ambient instruction, followed by a space before its text. */
function GateWord(): ReactElement {
  return (
    <>
      <i className="state-node__gate">gate</i>{' '}
    </>
  );
}

/**
 * A flow's ambient instructions under its name, each a button that selects it, in the columns that the layout reserved
 * for them; absent when the flow shows none.
 */
function Preamble({
  flowName,
  ambient,
  layout,
}: {
  flowName: string;
  ambient: StateNodeData['ambient'];
  layout: StateNodeData['preambleLayout'];
}): ReactElement | undefined {
  const { selectedPath, onSelect } = useContext(AmbientSelectionContext);
  if (ambient === undefined || ambient.length === 0) return undefined;
  // `canvas.css` sizes the preamble from these; without a layout's columns, it draws one column at its natural height.
  const style: CSSProperties & Record<`--${string}`, string> = {
    pointerEvents: 'auto',
    '--preamble-column-width': `${PREAMBLE_WIDTH}px`,
    '--preamble-column-gap': `${PREAMBLE_COLUMN_GAP}px`,
    '--preamble-columns': String(layout?.columns ?? 1),
    ...(layout !== undefined && { '--preamble-column-height': `${layout.columnHeight}px` }),
  };
  return (
    // The flow's body lets clicks through to the pane; its entries take them.
    <section className="state-node__preamble" aria-label={`Ambient instructions of ${flowName}`} style={style}>
      <div className="state-node__preamble-heading">Ambient</div>
      <ul>
        {ambient.map(({ path, text, gate }) => (
          <li key={path}>
            <button
              type="button"
              // Keep React Flow from dragging, panning, or taking the keys of the node around the button.
              className={`state-node__ambient nodrag nopan nokey${path === selectedPath ? ' state-node__ambient--selected' : ''}`}
              data-path={path}
              aria-pressed={path === selectedPath}
              style={{ WebkitLineClamp: MAX_AMBIENT_LINES }}
              onClick={(event) => {
                // Keep the flow's node from taking the click as its own selection.
                event.stopPropagation();
                onSelect(path);
              }}
            >
              {gate ? <GateWord /> : undefined}
              {text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Reports whether the pointer is over, or keyboard focus is on, the canvas node that contains an element. */
function useIsPointedAt(ref: RefObject<HTMLElement | null>): boolean {
  const [isPointedAt, setIsPointedAt] = useState(false);

  // Listen on React Flow's node wrapper, which takes the focus, rather than on the node's own content.
  useEffect(() => {
    const wrapper = ref.current?.closest('.react-flow__node');
    if (wrapper === null || wrapper === undefined) return;
    function show(): void {
      setIsPointedAt(true);
    }
    function hide(): void {
      setIsPointedAt(false);
    }
    const events = [
      ['pointerenter', show],
      ['pointerleave', hide],
      ['focus', show],
      ['blur', hide],
    ] as const;
    for (const [type, listener] of events) wrapper.addEventListener(type, listener);
    return () => {
      for (const [type, listener] of events) wrapper.removeEventListener(type, listener);
    };
  }, [ref]);

  return isPointedAt;
}

/** Returns where a flow's name sits at the canvas's zoom; a leaf's name stays in place. */
function useNamePlacement(data: StateNodeData): FlowNamePlacement {
  // Each selector returns a primitive that stays put while the name has room, so that a zoom re-renders the node only
  // while its name is crowded.
  const shift = useStore((state) => findNamePlacement(data, state.transform[2])?.shift ?? 0);
  const isShown = useStore((state) => findNamePlacement(data, state.transform[2])?.isShown ?? true);
  return { shift, isShown };
}
// endregion | Helpers
