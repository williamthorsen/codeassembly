import { type FitViewOptions, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { type RefObject, useEffect, useRef } from 'react';

import type { FlowElements, StateFlowNode, TransitionFlowEdge } from '../../layout/to-flow-elements.ts';
import { findElementBox } from './find-element-box.ts';

/**
 * Takes a new layout of the same chart, such as one that shows or hides the preambles, in place of the current one;
 * once React Flow has measured it, fits a fitted view again, or centres the selected element at the current zoom.
 */
export function useNewLayout({
  elements,
  nodes,
  setNodes,
  setEdges,
  isFitted,
  selectedPath,
  fitViewOptions,
}: {
  elements: FlowElements;
  /** The nodes that the canvas holds, whose change marks that React Flow holds the new layout. */
  nodes: StateFlowNode[];
  setNodes: (nodes: StateFlowNode[]) => void;
  setEdges: (edges: TransitionFlowEdge[]) => void;
  isFitted: RefObject<boolean>;
  selectedPath: string | undefined;
  fitViewOptions: FitViewOptions<StateFlowNode>;
}): void {
  const { fitView, getEdges, getInternalNode, getNodes, getViewport, setCenter } = useReactFlow<
    StateFlowNode,
    TransitionFlowEdge
  >();
  // React Flow measures new node objects before it can fit them, so the view waits until it has.
  const isMeasured = useNodesInitialized();
  const shownElements = useRef(elements);
  const isRelaidOut = useRef(false);

  useEffect(() => {
    if (shownElements.current === elements) return;
    shownElements.current = elements;
    isRelaidOut.current = true;
    setNodes(elements.nodes);
    setEdges(elements.edges);
  }, [elements, setEdges, setNodes]);

  useEffect(() => {
    if (!isRelaidOut.current || !isMeasured) return;
    isRelaidOut.current = false;
    if (isFitted.current) {
      void fitView(fitViewOptions);
      return;
    }
    if (selectedPath === undefined) return;
    const box = findElementBox(selectedPath, getNodes(), getEdges(), getInternalNode);
    if (box === undefined) return;
    void setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom: getViewport().zoom, duration: 300 });
  }, [
    fitView,
    fitViewOptions,
    getEdges,
    getInternalNode,
    getNodes,
    getViewport,
    isFitted,
    isMeasured,
    nodes,
    selectedPath,
    setCenter,
  ]);
}
