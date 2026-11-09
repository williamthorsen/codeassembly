import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useEffect } from 'react';

import type { StateFlowNode, TransitionFlowEdge } from '../../layout/to-flow-elements.ts';
import { findElementBox } from './find-element-box.ts';
import { findViewCentre, readView } from './find-view-centre.ts';

/**
 * Moves keyboard focus between a state and its outgoing transitions with the arrow keys, hands Tab on a transition to
 * its source state, so that the Tab sequence of states continues from there, and brings an element that the keyboard
 * focuses into view, reporting that move to `onCentre`.
 */
export function FocusNavigation({ onCentre }: { onCentre: () => void }): null {
  const store = useStoreApi<StateFlowNode, TransitionFlowEdge>();
  const { getEdges, getInternalNode, getNodes, getViewport, setCenter } = useReactFlow<
    StateFlowNode,
    TransitionFlowEdge
  >();

  useEffect(() => {
    const pane = store.getState().domNode;
    if (pane === null) return;

    function handleKeyDown(event: KeyboardEvent): void {
      const root = event.currentTarget;
      if (!(root instanceof HTMLElement)) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest('.react-flow__node, .react-flow__edge');
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
      const id = element.dataset['id'];
      if (id === undefined) return;
      const edges = getEdges();

      if (element.classList.contains('react-flow__node')) {
        const first = edges.find(({ source }) => source === id);
        if (event.key !== 'ArrowRight' || first === undefined) return;
        event.preventDefault();
        focusElement(root, 'edge', first.id);
        return;
      }

      const edge = edges.find((candidate) => candidate.id === id);
      if (edge === undefined) return;
      const siblings = edges.filter(({ source }) => source === edge.source);
      const index = siblings.indexOf(edge);
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault();
          const next = siblings[event.key === 'ArrowDown' ? index + 1 : index - 1];
          if (next !== undefined) focusElement(root, 'edge', next.id);
          break;
        }
        case 'ArrowLeft':
          event.preventDefault();
          focusElement(root, 'node', edge.source);
          break;
        case 'Tab':
          // Let the browser's own Tab move on from the source.
          focusElement(root, 'node', edge.source);
          break;
      }
    }

    // A click focuses without `:focus-visible`, and the selection that it makes is brought into view by `SelectionSync`.
    function handleFocusIn(event: FocusEvent): void {
      if (!(event.target instanceof HTMLElement || event.target instanceof SVGElement)) return;
      const { target } = event;
      const id = target.dataset['id'];
      if (id === undefined || !target.matches(':focus-visible')) return;
      const nodes = getNodes();
      const path = target.classList.contains('react-flow__node') ? nodes.find((node) => node.id === id)?.data.path : id;
      if (path === undefined) return;

      const box = findElementBox(path, nodes, getEdges(), getInternalNode);
      if (box === undefined) return;
      const { width, height } = store.getState();
      const viewport = getViewport();
      const centre = findViewCentre(box, readView(viewport, width, height));
      if (centre === undefined) return;
      onCentre();
      void setCenter(centre.x, centre.y, { zoom: viewport.zoom });
    }

    pane.addEventListener('keydown', handleKeyDown);
    pane.addEventListener('focusin', handleFocusIn);
    return () => {
      pane.removeEventListener('keydown', handleKeyDown);
      pane.removeEventListener('focusin', handleFocusIn);
    };
  }, [getEdges, getInternalNode, getNodes, getViewport, onCentre, setCenter, store]);

  return null;
}

// region | Helpers
/** Focuses the state or transition with an id. */
function focusElement(pane: HTMLElement, kind: 'node' | 'edge', id: string): void {
  const elements = pane.querySelectorAll<HTMLElement | SVGElement>(`.react-flow__${kind}`);
  [...elements].find((element) => element.dataset['id'] === id)?.focus();
}
// endregion | Helpers
