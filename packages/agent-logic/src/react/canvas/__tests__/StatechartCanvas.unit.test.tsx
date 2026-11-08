/* eslint-disable testing-library/no-container, testing-library/no-node-access -- React Flow draws the chart as positioned elements and SVG whose geometry and classes have no accessible query. */
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { toFlowElements } from '../../../layout/to-flow-elements.ts';
import type { AgentLogicConfig } from '../../../schema/agent-logic-schema.ts';
import { buildBranchingConfig } from '../../../test-utils/branching-config.ts';
import { BRANCHING_LAYOUT } from '../../../test-utils/branching-layout.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT, MINIMAL_TRANSITION_PATH } from '../../../test-utils/minimal-layout.ts';
import { StatechartCanvas } from '../StatechartCanvas.tsx';
import { readZoom } from '../test-utils/read-zoom.ts';
import { renderCanvas } from '../test-utils/render-canvas.tsx';
import { renderMinimalCanvas } from '../test-utils/render-minimal-canvas.tsx';
import { renderSelectingCanvas } from '../test-utils/render-selecting-canvas.tsx';
import { stubCanvasSize } from '../test-utils/stub-canvas-size.ts';
import { findFitZoom, READING_ZOOM } from '../zoom-levels.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe(StatechartCanvas, () => {
  it('draws a new layout of the same chart in place of the current one, keeping the selection', async () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    const description = describeConfig(config);
    const hidden = toFlowElements(description, MINIMAL_LAYOUT, { showAmbient: false });
    const shown = toFlowElements(description, MINIMAL_LAYOUT, { showAmbient: true });
    const { rerender } = render(<StatechartCanvas elements={hidden} selectedPath="states.done" onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Greet the user' })).not.toBeInTheDocument();

    rerender(<StatechartCanvas elements={shown} selectedPath="states.done" onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Greet the user' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^State done/ })).toHaveClass('selected');
  });

  it('when a focused state is selected with Enter, reports its path', async () => {
    const { onSelect } = renderMinimalCanvas();

    screen.getByRole('group', { name: /^State done/ }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenLastCalledWith('states.done');
  });

  it('visits the states with Tab, in document order, and never a transition', async () => {
    stubCanvasSize(1000, 1000);
    renderMinimalCanvas();
    await screen.findByRole('group', { name: /^Transition from greeting/ });

    await userEvent.tab();
    expect(screen.getByRole('group', { name: /^State agent/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('group', { name: /^State greeting/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('group', { name: /^State done/ })).toHaveFocus();
  });

  describe('with the arrow keys', () => {
    it("moves from a state through its outgoing transitions and back, in the config's order", async () => {
      await renderBranchingCanvas();
      const asking = screen.getByRole('group', { name: /^State asking/ });

      asking.focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(findTransition('user.agreed')).toHaveFocus();
      await userEvent.keyboard('{ArrowUp}');
      expect(findTransition('user.agreed')).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      expect(findTransition('user.declined')).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      expect(findTransition('user.declined')).toHaveFocus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(asking).toHaveFocus();
    });

    it("reaches a flow's flow-wide transitions from the flow", async () => {
      await renderBranchingCanvas();

      screen.getByRole('group', { name: /^State checking/ }).focus();
      await userEvent.keyboard('{ArrowRight}');

      expect(findTransition('user.cancelled')).toHaveFocus();
    });

    it('stays on a state without outgoing transitions', async () => {
      await renderBranchingCanvas();
      const done = screen.getByRole('group', { name: /^State done/ });

      done.focus();
      await userEvent.keyboard('{ArrowRight}');

      expect(done).toHaveFocus();
    });
  });

  it('names the arrow keys in the descriptions of a state and a transition', async () => {
    await renderBranchingCanvas();

    expect(readDescription(screen.getByRole('group', { name: /^State asking/ }))).toBe(
      "Press Enter or Space to select. Press Right arrow to move to the state's outgoing transitions, when it has any.",
    );
    expect(readDescription(findTransition('user.agreed'))).toBe(
      'Press Enter or Space to select. Press Up or Down arrow to move between transitions from the same state, or Left arrow to return to that state.',
    );
  });

  it('continues the Tab sequence after the source of a focused transition', async () => {
    await renderBranchingCanvas();

    screen.getByRole('group', { name: /^State asking/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.tab();
    expect(screen.getByRole('group', { name: /^State checking/ })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('group', { name: /^State asking/ })).toHaveFocus();
  });

  it('shows the state that the selected path names as selected', async () => {
    renderMinimalCanvas(undefined, 'states.done');

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /^State done/ })).toHaveClass('selected');
    });
    expect(screen.getByRole('group', { name: /^State greeting/ })).not.toHaveClass('selected');
  });

  describe('when it holds the selection in state', () => {
    it('clears a selection that Escape follows at once, and keeps every state drawn', async () => {
      const { container, readSelectedPath } = renderSelectingCanvas(buildMinimalConfig(), MINIMAL_LAYOUT);

      screen.getByRole('group', { name: /^State done/ }).focus();
      await userEvent.keyboard('{Enter}{Escape}');

      expect(readSelectedPath()).toBeUndefined();
      expect(container.querySelector('.react-flow__node.selected')).toBeNull();
      expect(screen.getByRole('group', { name: /^State done/ })).toBeInTheDocument();
    });

    it('settles on one selection when each selection reaches the state late', async () => {
      const { onSelect, readSelectedPath } = renderSelectingCanvas(buildMinimalConfig(), MINIMAL_LAYOUT, 10);
      const done = screen.getByRole('group', { name: /^State done/ });

      done.focus();
      fireEvent.keyDown(done, { key: 'Enter' });
      fireEvent.keyDown(done, { key: 'Escape' });
      await wait(100);
      const reportCount = onSelect.mock.calls.length;
      await wait(100);

      expect(onSelect).toHaveBeenCalledTimes(reportCount);
      // eslint-disable-next-line jest-dom/prefer-to-have-class -- The expected class depends on which selection settled.
      expect(done.classList.contains('selected')).toBe(readSelectedPath() === 'states.done');
    });

    it('selects a state that is clicked while a transition is selected', async () => {
      stubCanvasSize(1000, 1000);
      const { readSelectedPath } = renderSelectingCanvas(buildMinimalConfig(), MINIMAL_LAYOUT);
      const transition = await screen.findByRole('group', { name: /^Transition from greeting/ });

      fireEvent.click(transition);
      expect(readSelectedPath()).toBe(MINIMAL_TRANSITION_PATH);
      fireEvent.click(screen.getByRole('group', { name: /^State done/ }));

      expect(readSelectedPath()).toBe('states.done');
      expect(transition).not.toHaveClass('selected');
    });
  });

  describe('on a canvas smaller than the chart', () => {
    // The minimal layout's root state is 300×400 at (12, 12).
    const fitZoom = findFitZoom({ x: 12, y: 12, width: 300, height: 400 }, 150, 150);

    it('opens with the whole chart in view', async () => {
      stubCanvasSize(150, 150);
      const { container } = renderMinimalCanvas();

      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });
    });

    it('returns to the whole chart when Fit View is pressed after zooming in', async () => {
      stubCanvasSize(150, 150);
      const { container } = renderMinimalCanvas();
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });

      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
      await waitFor(() => {
        expect(readZoom(container)).toBeGreaterThan(fitZoom);
      });
      await userEvent.click(screen.getByRole('button', { name: 'Fit View' }));

      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });
    });

    it('keeps a zoom made with Zoom In when the canvas is resized', async () => {
      stubCanvasSize(150, 150);
      const { container } = renderMinimalCanvas();
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });
      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
      await waitFor(() => {
        expect(readZoom(container)).toBeGreaterThan(fitZoom);
      });
      const zoomedIn = readZoom(container);

      // Shrink the canvas, so that a fit would zoom out further than the fit level that the test opened at.
      stubCanvasSize(140, 140);
      fireEvent(globalThis.window, new Event('resize'));

      expect(readZoom(container)).toBeCloseTo(zoomedIn);
    });

    it('does not zoom out past the whole chart', async () => {
      stubCanvasSize(150, 150);
      const { container } = renderMinimalCanvas();
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });

      expect(screen.getByRole('button', { name: 'Zoom Out' })).toBeDisabled();
    });

    it('draws states as boxes at the fit level', async () => {
      stubCanvasSize(150, 150);
      const { container } = renderMinimalCanvas();

      await waitFor(() => {
        expect(container.querySelector('.react-flow')).toHaveClass('statechart-canvas__flow--shapes');
      });
    });

    it('selects a box and zooms to the reading zoom on it when it is clicked', async () => {
      stubCanvasSize(150, 150);
      const { container, onSelect } = renderMinimalCanvas();
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });

      // A click alone, because d3's pan handler reads the `mousedown` view that happy-dom leaves null.
      fireEvent.click(screen.getByRole('group', { name: /^State greeting/ }));

      expect(onSelect).toHaveBeenLastCalledWith('states.greeting');
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(READING_ZOOM);
      });
    });

    it('selects a flow without zooming when it is clicked', async () => {
      stubCanvasSize(150, 150);
      const { container, onSelect } = renderMinimalCanvas();
      await waitFor(() => {
        expect(readZoom(container)).toBeCloseTo(fitZoom);
      });

      fireEvent.click(screen.getByRole('group', { name: /^State agent/ }));

      expect(onSelect).toHaveBeenLastCalledWith('');
      expect(readZoom(container)).toBeCloseTo(fitZoom);
    });
  });

  describe('when the view is zoomed in on the first state', () => {
    it('brings a nested state that the keyboard focuses into view', async () => {
      const { container } = await renderZoomedBranchingCanvas(renderCanvas);

      screen.getByRole('group', { name: /^State looking_up/ }).focus();

      // `looking_up` is at (52, 372) on the canvas, 240×90.
      await waitFor(() => {
        expect(isInView(container, { x: 52, y: 372, width: 240, height: 90 })).toBe(true);
      });
    });

    it('brings a transition that the keyboard focuses into view', async () => {
      const { container } = await renderZoomedBranchingCanvas(renderCanvas);

      screen.getByRole('group', { name: /^State asking/ }).focus();
      await userEvent.keyboard('{ArrowRight}');

      // The label of `user.agreed` is at (570, 120) on the canvas, 120×26.
      await waitFor(() => {
        expect(isInView(container, { x: 570, y: 120, width: 120, height: 26 })).toBe(true);
      });
    });

    it('brings a state selected from outside the canvas into view', async () => {
      const { container, selectFromOutside } = await renderZoomedBranchingCanvas(renderCanvas);

      selectFromOutside('states.checking.states.looking_up');

      await waitFor(() => {
        expect(isInView(container, { x: 52, y: 372, width: 240, height: 90 })).toBe(true);
      });
    });

    it('keeps the view when a state outside it is selected on the canvas', async () => {
      const { container, readSelectedPath } = await renderZoomedBranchingCanvas(renderSelectingCanvas);
      const panBefore = readPan(container);

      fireEvent.click(screen.getByRole('group', { name: /^State looking_up/ }));
      expect(readSelectedPath()).toBe('states.checking.states.looking_up');
      await wait(400);

      expect(readPan(container)).toStrictEqual(panBefore);
    });

    it('keeps the view when the keyboard focuses a state already in it', async () => {
      const { container } = await renderZoomedBranchingCanvas(renderCanvas);
      const panBefore = readPan(container);

      screen.getByRole('group', { name: /^State asking/ }).focus();

      expect(readPan(container)).toStrictEqual(panBefore);
    });
  });

  it('pans when a drag starts on a transition, and does not select it', async () => {
    stubCanvasSize(500, 500);
    const { container, onSelect } = renderMinimalCanvas();
    const label = await waitFor(() => {
      const element = [...container.querySelectorAll<HTMLElement>('.transition-edge__label')].find(
        ({ dataset }) => dataset['path'] === MINIMAL_TRANSITION_PATH,
      );
      if (element === undefined) throw new Error('the transition has no label yet');
      return element;
    });
    const panBefore = readPan(container);

    fireEvent.pointerDown(label, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 140, clientY: 130 });
    fireEvent.pointerUp(document, { clientX: 140, clientY: 130 });
    fireEvent.click(label);

    await waitFor(() => {
      expect(readPan(container)).toStrictEqual({ x: panBefore.x + 40, y: panBefore.y + 30 });
    });
    expect(onSelect).not.toHaveBeenCalledWith(MINIMAL_TRANSITION_PATH);
  });
});

// region | Helpers
/** Returns the transition on the canvas whose label names an event. */
function findTransition(event: string): HTMLElement {
  return screen.getByRole('group', { name: new RegExp(`^Transition from .*: ${event}`) });
}

/**
 * Renders the branching config with `renderer` on a 300×300 canvas, zoomed to the reading zoom on the state `asking`.
 */
async function renderZoomedBranchingCanvas<Result extends { container: HTMLElement }>(
  renderer: (config: AgentLogicConfig, layout: ElkNode) => Result,
): Promise<Result> {
  stubCanvasSize(300, 300);
  const view = renderer(buildBranchingConfig(), BRANCHING_LAYOUT);
  const { container } = view;
  await screen.findAllByRole('group', { name: /^Transition from/ });
  // A click alone, because d3's pan handler reads the `mousedown` view that happy-dom leaves null.
  fireEvent.click(screen.getByRole('group', { name: /^State asking/ }));
  await waitFor(() => {
    expect(readZoom(container)).toBeCloseTo(READING_ZOOM);
  });
  return view;
}

/** Renders the branching config on a canvas large enough to hold it, once its transitions are drawn. */
async function renderBranchingCanvas(): Promise<void> {
  stubCanvasSize(1000, 1000);
  renderCanvas(buildBranchingConfig(), BRANCHING_LAYOUT);
  await screen.findAllByRole('group', { name: /^Transition from/ });
}

/** Reports whether a box in canvas coordinates lies wholly in the view of a 300×300 canvas. */
function isInView(container: HTMLElement, box: { x: number; y: number; width: number; height: number }): boolean {
  const pan = readPan(container);
  const zoom = readZoom(container);
  const view = { x: -pan.x / zoom, y: -pan.y / zoom, width: 300 / zoom, height: 300 / zoom };
  return (
    box.x >= view.x &&
    box.y >= view.y &&
    box.x + box.width <= view.x + view.width &&
    box.y + box.height <= view.y + view.height
  );
}

/**
 * Returns the text of the elements that describe an element, read directly because jest-dom's accessible description
 * omits React Flow's visually hidden description.
 */
function readDescription(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '').join(' ');
}

/** Reads the pan from the transform of the canvas's viewport. */
function readPan(container: HTMLElement): { x: number; y: number } {
  const transform = container.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '';
  const [, x, y] = /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(transform) ?? [];
  if (x === undefined || y === undefined) throw new Error(`the viewport has no translation: ${transform}`);
  return { x: Number(x), y: Number(y) };
}

/** Resolves after a number of milliseconds. */
async function wait(ms: number): Promise<void> {
  // eslint-disable-next-line sky-pilot/no-real-time-sleep -- React Flow and d3 schedule the delayed selections on real timers, which fake timers stall.
  await new Promise((resolve) => setTimeout(resolve, ms));
}
// endregion | Helpers
