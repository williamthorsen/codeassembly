import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { describe, expect, it } from 'vitest';

import { buildBranchingConfig } from '../../test-utils/branching-config.ts';
import { BRANCHING_LAYOUT } from '../../test-utils/branching-layout.ts';
import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT } from '../../test-utils/minimal-layout.ts';
import { describeConfig } from '../describe-config.ts';
import { toFlowElements } from '../to-flow-elements.ts';

describe(toFlowElements, () => {
  it("keeps ELK's parent-relative positions and sizes, and links each child to its parent", () => {
    const { nodes } = toFlowElements(describeConfig(buildMinimalConfig()), MINIMAL_LAYOUT);

    expect(
      nodes.map(({ id, parentId, position, width, height }) => ({ id, parentId, position, width, height })),
    ).toStrictEqual([
      { id: 'agent', parentId: undefined, position: { x: 12, y: 12 }, width: 300, height: 400 },
      { id: 'greeting', parentId: 'agent', position: { x: 20, y: 44 }, width: 240, height: 90 },
      { id: 'done', parentId: 'agent', position: { x: 20, y: 250 }, width: 240, height: 40 },
    ]);
  });

  it("gives every flow the chart's flows, parents first, at their positions and widths on the canvas, and gives a leaf none", () => {
    const { nodes } = toFlowElements(describeConfig(buildBranchingConfig()), BRANCHING_LAYOUT);
    const sites = [
      { id: 'agent', name: 'agent', x: 12, y: 12, width: 600 },
      { id: 'checking', name: 'checking', x: 32, y: 312, width: 400 },
    ];

    expect(nodes.map(({ id, data }) => ({ id, flowNameSites: data.flowNameSites }))).toStrictEqual([
      { id: 'agent', flowNameSites: sites },
      { id: 'asking', flowNameSites: undefined },
      { id: 'checking', flowNameSites: sites },
      { id: 'looking_up', flowNameSites: undefined },
      { id: 'done', flowNameSites: undefined },
    ]);
  });

  it("routes an edge through ELK's start, bend, and end points, and keeps its label box", () => {
    const { edges } = toFlowElements(describeConfig(buildMinimalConfig()), MINIMAL_LAYOUT);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.data).toMatchObject({
      points: [
        { x: 150, y: 146 },
        { x: 150, y: 200 },
        { x: 150, y: 274 },
      ],
      labelBox: { x: 160, y: 190, width: 200, height: 26 },
    });
  });

  it('passes pointer events through a flow, and not through any other state', () => {
    const { nodes } = toFlowElements(describeConfig(buildMinimalConfig()), MINIMAL_LAYOUT);

    expect(nodes.map(({ id, style }) => ({ id, pointerEvents: style?.pointerEvents }))).toStrictEqual([
      { id: 'agent', pointerEvents: 'none' },
      { id: 'greeting', pointerEvents: undefined },
      { id: 'done', pointerEvents: undefined },
    ]);
  });

  it('names each state with its kinds, and each transition with its label', () => {
    const { nodes, edges } = toFlowElements(describeConfig(buildMinimalConfig()), MINIMAL_LAYOUT);

    expect(nodes.map(({ ariaLabel }) => ariaLabel)).toStrictEqual([
      'State agent',
      'State greeting, Starts its flow, Waits for user, Performs actions',
      'State done, Ends',
    ]);
    expect(edges[0]?.ariaLabel).toBe('Transition from greeting to done: user.replied');
  });

  it('names each state and transition end in its label by the state name', () => {
    const config = buildMinimalConfig();
    config.meta.name = 'Greeter';
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.name = 'Greet the user';

    const { nodes, edges } = toFlowElements(describeConfig(config), MINIMAL_LAYOUT);

    expect(nodes.map(({ ariaLabel }) => ariaLabel?.split(',', 1)[0])).toStrictEqual([
      'State Greeter',
      'State Greet the user',
      'State done',
    ]);
    expect(edges[0]?.ariaLabel).toBe('Transition from Greet the user to done: user.replied');
  });

  it('keeps every transition out of the Tab sequence', () => {
    const { edges } = toFlowElements(describeConfig(buildMinimalConfig()), MINIMAL_LAYOUT);

    expect(edges.map(({ domAttributes }) => domAttributes?.tabIndex)).toStrictEqual([-1]);
  });

  it('when the layout lacks a state, throws naming it', () => {
    const layout: ElkNode = { ...MINIMAL_LAYOUT, children: [] };

    expect(() => toFlowElements(describeConfig(buildMinimalConfig()), layout)).toThrow('"agent"');
  });
});
