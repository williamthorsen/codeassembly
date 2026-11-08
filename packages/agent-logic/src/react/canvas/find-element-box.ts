import type { useReactFlow } from '@xyflow/react';

import type { StateFlowNode, TransitionFlowEdge } from '../../layout/to-flow-elements.ts';
import type { CanvasBox } from './find-view-centre.ts';

/** The height of the top of a flow that stands for one of its ambient instructions, which sit under its name. */
const AMBIENT_BOX_HEIGHT = 120;

/**
 * Returns an element's box in canvas coordinates: a state's card, the top of the flow that holds an ambient
 * instruction, or a transition's label or route.
 */
export function findElementBox(
  path: string,
  nodes: StateFlowNode[],
  edges: TransitionFlowEdge[],
  getInternalNode: ReturnType<typeof useReactFlow<StateFlowNode, TransitionFlowEdge>>['getInternalNode'],
): CanvasBox | undefined {
  const node = nodes.find(({ data }) => data.path === path);
  if (node !== undefined) {
    const position = getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;
    return { ...position, width: node.width ?? 0, height: node.height ?? 0 };
  }
  const container = nodes.find(({ data }) => data.ambient?.some((entry) => entry.path === path) === true);
  if (container !== undefined) {
    const position = getInternalNode(container.id)?.internals.positionAbsolute ?? container.position;
    return { ...position, width: container.width ?? 0, height: Math.min(container.height ?? 0, AMBIENT_BOX_HEIGHT) };
  }
  const data = edges.find(({ id }) => id === path)?.data;
  if (data === undefined) return undefined;
  if (data.labelBox !== undefined) return data.labelBox;
  if (data.points.length === 0) return undefined;
  const xs = data.points.map(({ x }) => x);
  const ys = data.points.map(({ y }) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
