import {
  applyEdgeChanges,
  applyNodeChanges,
  type AriaLabelConfig,
  Background,
  Controls,
  type EdgeChange,
  type FitViewOptions,
  getNodesBounds,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
} from '@xyflow/react';
import {
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FlowElements, StateFlowNode, TransitionFlowEdge } from '../../layout/to-flow-elements.ts';
import { AmbientSelectionContext } from './AmbientSelectionContext.ts';
import { DetailLevelContext } from './DetailLevelContext.ts';
import { findElementBox } from './find-element-box.ts';
import { findViewCentre, readView } from './find-view-centre.ts';
import { FocusNavigation } from './FocusNavigation.tsx';
import { type ChartMark, listChartMarks } from './list-chart-marks.ts';
import { ArrowheadDefs } from './marks.tsx';
import { StateNode } from './StateNode.tsx';
import { TransitionEdge } from './TransitionEdge.tsx';
import { useNewLayout } from './useNewLayout.ts';
import { findDetailLevel, findFitZoom, FIT_PADDING, READING_ZOOM } from './zoom-levels.ts';

export interface StatechartCanvasProps {
  elements: FlowElements;
  /** The path of the state or transition to show selected; one selected from outside the canvas is brought into view. */
  selectedPath: string | undefined;
  /** Receives the path of the selected state or transition, or `undefined` when nothing is selected. */
  onSelect: (path: string | undefined) => void;
  /** Called whenever the view pans or zooms. */
  onViewportChange?: (() => void) | undefined;
  /** Renders the key below the chart from the marks that the chart draws; the canvas renders no key without it. */
  renderKey?: ((marks: ReadonlySet<ChartMark>) => ReactNode) | undefined;
}

interface SelectionReport {
  path: string | undefined;
}

const nodeTypes = { state: StateNode };
const edgeTypes = { transition: TransitionEdge };
// The store's minimum zoom is the fit level itself, so a fit must not be held to it.
const fitViewOptions: FitViewOptions<StateFlowNode> = {
  padding: FIT_PADDING,
  minZoom: Number.MIN_VALUE,
  maxZoom: READING_ZOOM,
};
const MAX_ZOOM = 2;
// The keys that the canvas offers on a focused element; React Flow's defaults name a Delete key that it does not.
const STATE_DESCRIPTION =
  "Press Enter or Space to select. Press Right arrow to move to the state's outgoing transitions, when it has any.";
const ariaLabelConfig = {
  'node.a11yDescription.default': STATE_DESCRIPTION,
  // React Flow describes a node with this text while keyboard access is enabled.
  'node.a11yDescription.keyboardDisabled': STATE_DESCRIPTION,
  'edge.a11yDescription.default':
    'Press Enter or Space to select. Press Up or Down arrow to move between transitions from the same state, or Left arrow to return to that state.',
} satisfies Partial<AriaLabelConfig>;
// How far, in screen pixels, a press on a transition moves before it pans rather than clicks.
const DRAG_THRESHOLD = 3;

/** An interactive statechart whose states and transitions are selectable by pointer and keyboard. */
export function StatechartCanvas({ elements, renderKey, ...props }: StatechartCanvasProps): ReactElement {
  const marks = useMemo(() => listChartMarks(elements), [elements]);
  return (
    <div className="statechart-canvas">
      <ReactFlowProvider>
        <StatechartFlow elements={elements} {...props} />
      </ReactFlowProvider>
      {renderKey?.(marks)}
    </div>
  );
}

// region | Helpers
/**
 * Pans the canvas when a drag starts on a transition, which React Flow's own panning skips because it marks every edge
 * as not panning, and reports the move to `onPan`. A press that does not move stays a click, which selects the edge.
 */
function EdgeDragPan({ onPan }: { onPan: () => void }): null {
  const store = useStoreApi<StateFlowNode, TransitionFlowEdge>();

  useEffect(() => {
    const pane = store.getState().domNode;
    if (pane === null) return;

    function handlePointerDown(down: PointerEvent): void {
      if (down.button !== 0 || !(down.target instanceof Element) || down.target.closest('.react-flow__edge') === null) {
        return;
      }
      let last = { x: down.clientX, y: down.clientY };
      let isDragging = false;

      function handlePointerMove(move: PointerEvent): void {
        if (!isDragging && Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) < DRAG_THRESHOLD)
          return;
        if (!isDragging) onPan();
        isDragging = true;
        void store.getState().panBy({ x: move.clientX - last.x, y: move.clientY - last.y });
        last = { x: move.clientX, y: move.clientY };
      }
      function handlePointerUp(): void {
        globalThis.removeEventListener('pointermove', handlePointerMove);
        globalThis.removeEventListener('pointerup', handlePointerUp);
        globalThis.removeEventListener('pointercancel', handlePointerUp);
        // Swallow the click that ends a drag, so that a pan does not also select the edge.
        if (isDragging) globalThis.addEventListener('click', stopClick, { capture: true, once: true });
      }
      globalThis.addEventListener('pointermove', handlePointerMove);
      globalThis.addEventListener('pointerup', handlePointerUp);
      // A drag that the browser cancels ends as one that the reader releases.
      globalThis.addEventListener('pointercancel', handlePointerUp);
    }

    pane.addEventListener('pointerdown', handlePointerDown);
    return () => {
      pane.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onPan, store]);

  return null;
}

/**
 * Brings the element of a selection made outside the canvas into view when any of it lies outside, reporting that move
 * to `onCentre`.
 */
function SelectionSync({
  selectedPath,
  reportRef,
  onCentre,
}: {
  selectedPath: string | undefined;
  reportRef: RefObject<SelectionReport | undefined>;
  onCentre: () => void;
}): null {
  const store = useStoreApi<StateFlowNode, TransitionFlowEdge>();
  const { getNodes, getEdges, getInternalNode, getViewport, setCenter } = useReactFlow<
    StateFlowNode,
    TransitionFlowEdge
  >();

  useEffect(() => {
    const report = reportRef.current;
    reportRef.current = undefined;
    // Moving the view for a selection made on the canvas would move it under the pointer.
    if (report?.path === selectedPath || selectedPath === undefined) return;

    const box = findElementBox(selectedPath, getNodes(), getEdges(), getInternalNode);
    if (box === undefined) return;
    const { width, height } = store.getState();
    const viewport = getViewport();
    const centre = findViewCentre(box, readView(viewport, width, height));
    if (centre === undefined) return;
    onCentre();
    void setCenter(centre.x, centre.y, { zoom: viewport.zoom, duration: 300 });
  }, [getEdges, getInternalNode, getNodes, getViewport, onCentre, reportRef, selectedPath, setCenter, store]);

  return null;
}

/** Returns the canvas's flow, zoomable from the level that fits the whole chart to 200%. */
function StatechartFlow({ elements, selectedPath, onSelect, onViewportChange }: StatechartCanvasProps): ReactElement {
  const { fitView, getInternalNode, getViewport, setCenter, zoomTo } = useReactFlow<
    StateFlowNode,
    TransitionFlowEdge
  >();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  // The top-level states contain the rest, and their positions are absolute.
  const bounds = useMemo(
    () => getNodesBounds(elements.nodes.filter(({ parentId }) => parentId === undefined)),
    [elements.nodes],
  );
  const fitZoom = findFitZoom(bounds, width, height);
  const detailLevel = useStore((state) => findDetailLevel(state.transform[2]));

  // Whether the view shows the whole chart as fitted: from the open view until the reader or a selection moves it, and
  // again after Fit View.
  const isFitted = useRef(true);
  const markMoved = useCallback(() => {
    isFitted.current = false;
  }, []);

  // On a resize, fit a fitted view again, since the open view is fitted before the canvas takes its size; raise any
  // other view left below the new minimum, keeping its centre.
  useEffect(() => {
    if (isFitted.current) void fitView(fitViewOptions);
    else if (getViewport().zoom < fitZoom) void zoomTo(fitZoom);
  }, [fitView, fitZoom, getViewport, height, width, zoomTo]);

  // The flow is controlled so that `selectedPath` is the only record of the selection: React Flow's select changes are
  // reported to `onSelect` while the input event is handled, and never applied here.
  const [nodes, setNodes] = useState(elements.nodes);
  const [edges, setEdges] = useState(elements.edges);
  const shownNodes = useMemo(
    () => nodes.map((node) => withSelected(node, node.data.path === selectedPath)),
    [nodes, selectedPath],
  );
  const shownEdges = useMemo(
    () => edges.map((edge) => withSelected(edge, edge.id === selectedPath)),
    [edges, selectedPath],
  );
  // The last selection that the canvas reported and that has not yet come back as `selectedPath`.
  const reportRef = useRef<SelectionReport | undefined>(undefined);

  useNewLayout({ elements, nodes, setNodes, setEdges, isFitted, selectedPath, fitViewOptions });

  const ambientSelection = useMemo(
    () => ({
      selectedPath,
      onSelect: (path: string) => {
        reportRef.current = { path };
        onSelect(path);
      },
    }),
    [onSelect, selectedPath],
  );

  const reportSelectChanges = useCallback(
    (
      changes: ReadonlyArray<NodeChange<StateFlowNode> | EdgeChange<TransitionFlowEdge>>,
      findPath: (id: string) => string | undefined,
    ) => {
      for (const change of changes) {
        if (change.type !== 'select') continue;
        const path = findPath(change.id);
        if (path === undefined) continue;
        const currentPath = reportRef.current === undefined ? selectedPath : reportRef.current.path;
        // One input can deselect one element and select another in either order, so a deselection clears only the
        // element that is selected.
        if (!change.selected && path !== currentPath) continue;
        const nextPath = change.selected ? path : undefined;
        reportRef.current = { path: nextPath };
        onSelect(nextPath);
      }
    },
    [onSelect, selectedPath],
  );
  const handleNodesChange = useCallback(
    (changes: Array<NodeChange<StateFlowNode>>) => {
      reportSelectChanges(changes, (id) => nodes.find((node) => node.id === id)?.data.path);
      const otherChanges = changes.filter(({ type }) => type !== 'select');
      if (otherChanges.length > 0) setNodes((current) => applyNodeChanges(otherChanges, current));
    },
    [nodes, reportSelectChanges],
  );
  const handleEdgesChange = useCallback(
    (changes: Array<EdgeChange<TransitionFlowEdge>>) => {
      reportSelectChanges(changes, (id) => edges.find((edge) => edge.id === id)?.data?.path);
      const otherChanges = changes.filter(({ type }) => type !== 'select');
      if (otherChanges.length > 0) setEdges((current) => applyEdgeChanges(otherChanges, current));
    },
    [edges, reportSelectChanges],
  );

  // A state drawn as a box is read at the reading zoom, so a click on one goes there.
  const handleNodeClick = useCallback(
    (_event: unknown, node: StateFlowNode) => {
      if (detailLevel !== 'shapes' || node.data.isCompound) return;
      const position = getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;
      const centreX = position.x + (node.width ?? 0) / 2;
      const centreY = position.y + (node.height ?? 0) / 2;
      markMoved();
      void setCenter(centreX, centreY, { zoom: READING_ZOOM, duration: 300 });
    },
    [detailLevel, getInternalNode, markMoved, setCenter],
  );

  return (
    <DetailLevelContext.Provider value={detailLevel}>
      <AmbientSelectionContext.Provider value={ambientSelection}>
        <ReactFlow<StateFlowNode, TransitionFlowEdge>
          className={`statechart-canvas__flow--${detailLevel}`}
          nodes={shownNodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={handleNodeClick}
          onMoveStart={(event) => {
            // A move that the code makes has no event.
            if (event !== null) markMoved();
          }}
          {...(onViewportChange === undefined ? {} : { onMove: onViewportChange })}
          nodesDraggable={false}
          nodesConnectable={false}
          multiSelectionKeyCode={null}
          fitView
          fitViewOptions={fitViewOptions}
          autoPanOnNodeFocus={false}
          ariaLabelConfig={ariaLabelConfig}
          minZoom={fitZoom}
          maxZoom={MAX_ZOOM}
          colorMode="system"
        >
          <Background />
          <ArrowheadDefs />
          <Controls
            showInteractive={false}
            fitViewOptions={fitViewOptions}
            onFitView={() => {
              isFitted.current = true;
            }}
            // A zoom from these buttons has no event, so `onMoveStart` does not report it.
            onZoomIn={markMoved}
            onZoomOut={markMoved}
          />
          <SelectionSync selectedPath={selectedPath} reportRef={reportRef} onCentre={markMoved} />
          <EdgeDragPan onPan={markMoved} />
          <FocusNavigation onCentre={markMoved} />
          <ZoomProperty />
        </ReactFlow>
      </AmbientSelectionContext.Provider>
    </DetailLevelContext.Provider>
  );
}

/** Keeps the zoom in the canvas's `--canvas-zoom` property, for text that holds a fixed screen size. */
function ZoomProperty(): null {
  const store = useStoreApi<StateFlowNode, TransitionFlowEdge>();

  // Subscribe rather than select, so that a pan or zoom writes the property without rendering anything.
  useEffect(() => {
    function applyZoom({ domNode, transform }: ReturnType<typeof store.getState>): void {
      domNode?.style.setProperty('--canvas-zoom', String(transform[2]));
    }
    applyZoom(store.getState());
    return store.subscribe(applyZoom);
  }, [store]);

  return null;
}

/** Stops a click from reaching anything else. */
function stopClick(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();
}

/** Returns the element with `selected` set as given, or the element itself when it already matches. */
function withSelected<Element extends { selected?: boolean }>(element: Element, isSelected: boolean): Element {
  return element.selected === isSelected ? element : { ...element, selected: isSelected };
}
// endregion | Helpers
