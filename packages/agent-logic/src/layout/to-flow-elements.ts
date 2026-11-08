import type { Edge, Node } from '@xyflow/react';
import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api.js';

import { type ElkGraphOptions, HIDDEN_AMBIENT } from './build-elk-graph.ts';
import {
  type AmbientDescription,
  buildTransitionLabel,
  type ConfigDescription,
  listStateKinds,
  type StateDescription,
  type TransitionDescription,
} from './describe-config.ts';
import { packPreamble, type PreambleColumns } from './pack-preamble.ts';

export type StateFlowNode = Node<StateNodeData, 'state'>;

export type StateNodeData = Plain<StateDescription> & {
  /** Every flow of the chart, parents first, which a flow places its name among; absent for a leaf. */
  flowNameSites?: FlowNameSite[];
  /** The flow's ambient instructions, drawn as its preamble; absent for a leaf and while preambles are hidden. */
  ambient?: Plain<AmbientDescription>[];
  /** The columns that the layout reserved for the flow's preamble; absent when the flow draws none. */
  preambleLayout?: Plain<PreambleColumns>;
};

/** A flow's id, the name that it shows, and the top-left corner and width of the flow in canvas coordinates. */
export interface FlowNameSite {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
}

export type TransitionEdgeData = Plain<TransitionDescription> & {
  /** The route in canvas coordinates, from the source's border to the target's. */
  points: ElkPoint[];
  /** The label's box in canvas coordinates. */
  labelBox: { x: number; y: number; width: number; height: number } | undefined;
};

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

/** Restates an interface as an object type, which, unlike an interface, satisfies React Flow's `Record<string, unknown>` data constraint. */
type Plain<T> = { [K in keyof T]: T[K] };

export interface FlowElements {
  /** Nodes with each parent before its children, as React Flow requires. */
  nodes: StateFlowNode[];
  edges: TransitionFlowEdge[];
}

/** Combines a described config with its ELK layout into React Flow nodes and edges. */
export function toFlowElements(
  description: ConfigDescription,
  layout: ElkNode,
  { showAmbient, preambleColumnLimits }: Pick<ElkGraphOptions, 'showAmbient' | 'preambleColumnLimits'> = HIDDEN_AMBIENT,
): FlowElements {
  const elkNodes = new Map<string, ElkNode>();
  const elkEdges = new Map<string, ElkExtendedEdge>();
  collectLayout(layout, elkNodes, elkEdges);

  const flowNameSites = listFlowNameSites(description, elkNodes);
  const nodes = description.states.map((state): StateFlowNode => {
    const elkNode = requireLayout(elkNodes.get(state.id), state.id);
    const ambient =
      state.isCompound && showAmbient
        ? description.ambient.filter(({ containerId }) => containerId === state.id)
        : undefined;
    return {
      id: state.id,
      type: 'state',
      position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
      width: elkNode.width ?? 0,
      height: elkNode.height ?? 0,
      ...(state.parentId !== undefined && { parentId: state.parentId }),
      // A flow's body is the chart's background, so a click there reaches the pane, which clears the selection.
      ...(state.isCompound && { style: { pointerEvents: 'none' } }),
      ariaLabel: [`State ${state.name}`, ...listStateKinds(state)].join(', '),
      data: {
        ...state,
        ...(state.isCompound && { flowNameSites }),
        ...(ambient !== undefined && { ambient }),
        ...(ambient !== undefined &&
          ambient.length > 0 && { preambleLayout: packPreamble(ambient, preambleColumnLimits?.get(state.id) ?? 1) }),
      },
    };
  });

  const edges = description.transitions.map((transition): TransitionFlowEdge => {
    const elkEdge = requireLayout(elkEdges.get(transition.path), transition.path);
    const [section] = elkEdge.sections ?? [];
    const [label] = elkEdge.labels ?? [];
    const { trigger, details } = buildTransitionLabel(transition);
    return {
      id: transition.path,
      type: 'transition',
      source: transition.sourceId,
      target: transition.targetId,
      ariaLabel: `Transition from ${transition.sourceName} to ${transition.targetName}: ${[...(trigger === undefined ? [] : [trigger]), ...details].join('; ')}`,
      // Keep transitions out of the Tab sequence, which visits states; the arrow keys reach a state's transitions.
      domAttributes: { tabIndex: -1 },
      data: {
        ...transition,
        points: section === undefined ? [] : [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
        labelBox:
          label === undefined
            ? undefined
            : { x: label.x ?? 0, y: label.y ?? 0, width: label.width ?? 0, height: label.height ?? 0 },
      },
    };
  });

  return { nodes, edges };
}

// region | Helpers
function collectLayout(node: ElkNode, nodes: Map<string, ElkNode>, edges: Map<string, ElkExtendedEdge>): void {
  nodes.set(node.id, node);
  const ownEdges = node.edges ?? [];
  for (const edge of ownEdges) {
    edges.set(edge.id, edge);
  }
  const children = node.children ?? [];
  for (const child of children) {
    collectLayout(child, nodes, edges);
  }
}

/** Lists each flow's name site, in the description's order, in which a parent precedes its children. */
function listFlowNameSites(description: ConfigDescription, elkNodes: Map<string, ElkNode>): FlowNameSite[] {
  const origins = new Map<string, { x: number; y: number }>();
  const sites: FlowNameSite[] = [];
  for (const state of description.states) {
    const elkNode = requireLayout(elkNodes.get(state.id), state.id);
    const parent =
      state.parentId === undefined ? { x: 0, y: 0 } : requireLayout(origins.get(state.parentId), state.parentId);
    const origin = { x: parent.x + (elkNode.x ?? 0), y: parent.y + (elkNode.y ?? 0) };
    origins.set(state.id, origin);
    if (state.isCompound) sites.push({ id: state.id, name: state.name, ...origin, width: elkNode.width ?? 0 });
  }
  return sites;
}

function requireLayout<T>(value: T | undefined, id: string): T {
  if (value === undefined) throw new Error(`The layout lacks the element "${id}".`);
  return value;
}
// endregion | Helpers
