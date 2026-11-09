/* eslint-disable testing-library/no-container, testing-library/no-node-access -- React Flow draws the chart as positioned elements and SVG whose geometry and classes have no accessible query. */
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { type EdgeProps, Position, ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { TransitionEdgeData, TransitionFlowEdge } from '../../../layout/to-flow-elements.ts';
import { ArrowheadDefs } from '../marks.tsx';
import { TransitionEdge } from '../TransitionEdge.tsx';

const DATA: TransitionEdgeData = {
  kind: 'transition',
  path: 'states.handling.on["user.asks_for_human"]',
  sourceId: 'handling',
  sourceName: 'Handling',
  targetId: 'handed_off',
  targetName: 'Handed off',
  event: 'user.asks_for_human',
  guard: 'the customer is angry',
  actions: [{ text: 'apologize', gate: false, source: undefined }],
  isGlobal: true,
  isFallback: false,
  lacksAlternative: false,
  inferred: false,
  gate: false,
  source: { start: 0, end: 1 },
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 40 },
    { x: 30, y: 40 },
  ],
  labelBox: { x: 4, y: 10, width: 200, height: 60 },
};

describe(TransitionEdge, () => {
  it('draws the ELK route as a polyline', () => {
    const { container } = renderTransitionEdge(DATA);

    expect(container.querySelector('.transition-edge__path')).toHaveAttribute('d', 'M 0 0 L 0 40 L 30 40');
  });

  it('labels a global transition with its trigger, guard, and actions, and marks its path', () => {
    const { container } = renderTransitionEdge(DATA);

    expect(screen.getByText('Any time: user.asks_for_human')).toBeInTheDocument();
    expect(screen.getByText('If the customer is angry')).toBeInTheDocument();
    expect(screen.getByText('Do: apologize')).toBeInTheDocument();
    expect(container.querySelector('.transition-edge__path')).toHaveClass('transition-edge__path--global');
  });

  it('sets "otherwise" and "inferred" apart as kind words, and dashes an inferred path', () => {
    const { container } = renderTransitionEdge({
      ...DATA,
      event: undefined,
      guard: undefined,
      actions: [],
      isGlobal: false,
      isFallback: true,
      inferred: true,
    });

    expect(screen.getByText('otherwise')).toHaveClass('transition-edge__word');
    expect(screen.getByText('inferred')).toHaveClass('transition-edge__word');
    expect(container.querySelector('.transition-edge__trigger')).toBeNull();
    expect(container.querySelector('.transition-edge__path')).toHaveClass('transition-edge__path--inferred');
  });

  it('sets "no alternative" apart as a kind word after the guard', () => {
    renderTransitionEdge({ ...DATA, guard: 'the reply is yes', lacksAlternative: true });

    expect(screen.getByText('no alternative')).toHaveClass('transition-edge__word');
  });

  it("leaves the arrowhead to the stylesheet, which picks it by the path's classes", () => {
    const { container } = renderTransitionEdge(DATA);

    expect(container.querySelector('.transition-edge__path')).not.toHaveAttribute('marker-end');
  });
});

describe(ArrowheadDefs, () => {
  it('defines one arrowhead per edge colour', () => {
    const { container } = render(<ArrowheadDefs />);

    expect([...container.querySelectorAll('marker')].map(({ id }) => id)).toStrictEqual([
      'arrowhead-global',
      'arrowhead-ordinary',
      'arrowhead-selected',
    ]);
  });
});

// region | Helpers
function renderTransitionEdge(data: TransitionEdgeData): ReturnType<typeof render> {
  const props: EdgeProps<TransitionFlowEdge> = {
    id: data.path,
    type: 'transition',
    source: data.sourceId,
    target: data.targetId,
    data,
    selected: false,
    selectable: true,
    deletable: false,
    sourceX: 0,
    sourceY: 0,
    targetX: 30,
    targetY: 40,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  };
  return render(
    <ReactFlowProvider>
      <svg>
        <TransitionEdge {...props} />
      </svg>
    </ReactFlowProvider>,
  );
}
// endregion | Helpers
