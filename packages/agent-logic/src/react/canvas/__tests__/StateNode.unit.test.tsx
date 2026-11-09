/* eslint-disable testing-library/no-container, testing-library/no-node-access -- React Flow draws the chart as positioned elements and SVG whose geometry and classes have no accessible query. */
// @vitest-environment happy-dom
// eslint-disable-next-line testing-library/no-manual-cleanup -- Each case unmounts its first render so that the second starts from an empty document.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { PointerEventsCheckLevel, userEvent } from '@testing-library/user-event';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildBranchingConfig } from '../../../test-utils/branching-config.ts';
import { BRANCHING_LAYOUT } from '../../../test-utils/branching-layout.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT } from '../../../test-utils/minimal-layout.ts';
import { StateNode } from '../StateNode.tsx';
import { readZoom } from '../test-utils/read-zoom.ts';
import { renderCanvas } from '../test-utils/render-canvas.tsx';
import { renderMinimalCanvas } from '../test-utils/render-minimal-canvas.tsx';
import { stubCanvasSize } from '../test-utils/stub-canvas-size.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe(StateNode, () => {
  it("draws a flow's ambient instructions under its name, each selecting itself rather than the flow", async () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    const { onSelect } = renderCanvas(config, MINIMAL_LAYOUT, undefined, { showAmbient: true });

    const preamble = screen.getByRole('region', { name: 'Ambient instructions of agent' });
    await userEvent.click(within(preamble).getByRole('button', { name: 'Greet the user' }));

    expect(onSelect).toHaveBeenCalledWith('meta.ambient[0]');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks the selected ambient instruction pressed, and draws no preamble while preambles are hidden', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    renderCanvas(config, MINIMAL_LAYOUT, 'meta.ambient[0]', { showAmbient: true });

    expect(screen.getByRole('button', { name: 'Greet the user' })).toBePressed();
    cleanup();

    renderCanvas(config, MINIMAL_LAYOUT, undefined, { showAmbient: false });
    expect(screen.queryByRole('region', { name: 'Ambient instructions of agent' })).not.toBeInTheDocument();
  });

  it('marks a gated action and a gated ambient instruction with the word "gate"', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14, gate: true }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.entry = [
      { type: 'nl', params: { text: 'greet the user' }, meta: { source: { start: 0, end: 14 }, gate: true } },
    ];
    renderCanvas(config, MINIMAL_LAYOUT, undefined, { showAmbient: true });

    const action = within(screen.getByRole('group', { name: /^State greeting/ })).getByRole('listitem');
    expect(within(action).getByText('gate')).toHaveClass('state-node__gate');
    expect(action).toHaveTextContent('gate greet the user');
    expect(screen.getByRole('button', { name: 'gate Greet the user' })).toBeInTheDocument();
  });

  it('marks a waiting state that starts its flow, and lists its entry actions under "Does"', () => {
    renderMinimalCanvas();
    const greetingNode = screen.getByRole('group', { name: /^State greeting/ });
    const greeting = within(greetingNode);

    expect(greetingNode.querySelector('.state-node')).toHaveClass('state-node--waiting');
    expect(greetingNode.querySelector(':scope .state-node__glyphs title')).toHaveTextContent('Waits for user');
    expect(greetingNode.querySelector(':scope .state-node__initial-mark title')).toHaveTextContent('Starts here');
    expect(greeting.getByText('Does')).toBeInTheDocument();
    expect(greeting.getByRole('listitem')).toHaveTextContent('greet the user');
  });

  it('shows exit actions under "On exit" and marks an inferred final state with its glyph and the word "inferred"', () => {
    const config = buildMinimalConfig();
    const done = config.states['done'];
    if (done === undefined) throw new Error('fixture lacks the done state');
    done.exit = [{ type: 'nl', params: { text: 'log the call' } }];
    done.meta.inferred = true;

    renderMinimalCanvas(config);
    const doneNode = screen.getByRole('group', { name: /^State done/ });

    expect(within(doneNode).getByText('On exit')).toBeInTheDocument();
    expect(within(doneNode).getByText('inferred')).toHaveClass('state-node__inferred');
    expect(doneNode.querySelector(':scope .state-node__glyphs title')).toHaveTextContent('Ends');
    expect(doneNode.querySelector('.state-node__initial-mark')).toBeNull();
    expect(doneNode.querySelector('.state-node')).toHaveClass('state-node--inferred', 'state-node--final');
  });

  it('counts the gates among the actions that the card leaves out', () => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.entry = [
      { type: 'nl', params: { text: 'greet' } },
      { type: 'nl', params: { text: 'wait' } },
      { type: 'nl', params: { text: 'listen' } },
      { type: 'nl', params: { text: 'never skip' }, meta: { source: { start: 0, end: 5 }, gate: true } },
    ];

    renderMinimalCanvas(config);

    expect(
      within(screen.getByRole('group', { name: /^State greeting/ })).getByText('2 more, including 1 gate'),
    ).toHaveClass('state-node__more');
  });

  it('lists the first two actions, clamped, and counts the rest', () => {
    const config = buildMinimalConfig();
    const greeting = config.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.entry = ['one', 'two', 'three', 'four'].map((text) => ({ type: 'nl', params: { text } }));

    renderMinimalCanvas(config);
    const greetingNode = within(screen.getByRole('group', { name: /^State greeting/ }));

    expect(greetingNode.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual(['one', 'two']);
    expect(greetingNode.getByText('2 more')).toBeInTheDocument();
  });

  it('marks a state that nothing enters with the "Unreachable" glyph', () => {
    const config = buildMinimalConfig();
    const reply = config.states['greeting']?.on?.['user.replied'];
    if (reply === undefined || Array.isArray(reply)) throw new Error('fixture lacks the single reply');
    delete reply.target;

    renderMinimalCanvas(config);
    const doneNode = screen.getByRole('group', { name: 'State done, Ends, Unreachable' });

    expect(doneNode.querySelector(':scope .mark-glyph--unreachable title')).toHaveTextContent('Unreachable');
    // eslint-disable-next-line testing-library/prefer-presence-queries -- The state is present; the glyph inside it is the absence asserted.
    expect(screen.getByRole('group', { name: /^State greeting/ }).querySelector('.mark-glyph--unreachable')).toBeNull();
  });

  it('marks a state that none of its own transitions leaves with the "No exit" glyph', () => {
    const config = buildMinimalConfig();
    const done = config.states['done'];
    if (done === undefined) throw new Error('fixture lacks the done state');
    delete done.type;

    renderMinimalCanvas(config);
    const doneNode = screen.getByRole('group', { name: 'State done, No exit' });

    expect(doneNode.querySelector(':scope .state-node__glyphs title')).toHaveTextContent('No exit');
    // eslint-disable-next-line testing-library/prefer-presence-queries -- The state is present; the glyph inside it is the absence asserted.
    expect(screen.getByRole('group', { name: /^State greeting/ }).querySelector('.mark-glyph--no-exit')).toBeNull();
  });

  it('names a flow outside its container, with the whole name on hover', () => {
    renderMinimalCanvas();
    const agent = screen.getByRole('group', { name: /^State agent/ });

    const name = within(agent).getByText('agent');

    expect(name).toHaveClass('state-node__flow-name');
    expect(name).toHaveAttribute('title', 'agent');
  });

  it("titles a card, names a flow, and labels a flow's preamble by the state's name", () => {
    renderCanvas(buildNamedConfig(), MINIMAL_LAYOUT, undefined, { showAmbient: true });

    const flowName = within(screen.getByRole('group', { name: /^State Greeter/ })).getByText('Greeter');
    expect(flowName).toHaveClass('state-node__flow-name');
    expect(flowName).toHaveAttribute('title', 'Greeter');
    expect(
      within(screen.getByRole('group', { name: /^State Greet the user/ })).getByText('Greet the user', {
        selector: '.state-node__title',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ambient instructions of Greeter' })).toBeInTheDocument();
  });

  it("moves a nested flow's name right while its parent's name would overlap it, and leaves it in place otherwise", () => {
    renderCanvas(buildBranchingConfig(), BRANCHING_LAYOUT);
    const roomy = within(screen.getByRole('group', { name: /^State checking/ })).getByText('checking');

    expect(roomy).toHaveStyle({ translate: '' });

    cleanup();
    renderCanvas(buildBranchingConfig(), withCheckingOffset(10));
    const crowded = within(screen.getByRole('group', { name: /^State checking/ })).getByText('checking');

    expect(crowded.style.translate).toMatch(/^\d+(\.\d+)?px/);
  });

  it("draws a crowded nested flow's name that cannot start over its flow as a band that names it in a tooltip", async () => {
    // At 30 wide, the flow ends where its parent's name, plus the gap, pushes its own name to start.
    renderCanvas(buildBranchingConfig(), withCheckingOffset(10, 30));
    const band = within(screen.getByRole('group', { name: /^State checking/ })).getByText('checking');

    expect(band).toHaveClass('state-node__flow-name--hidden');

    // The stylesheet that gives a flow's name pointer events through its node is not loaded here.
    await userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }).hover(band);

    expect(screen.getByRole('tooltip')).toHaveTextContent('checking');
  });

  it('keeps flow names at a fixed screen size by publishing the zoom to scale them against', async () => {
    stubCanvasSize(150, 150);
    const { container } = renderMinimalCanvas();
    const canvas = container.querySelector<HTMLElement>('.react-flow');

    await waitFor(() => {
      expect(Number(canvas?.style.getPropertyValue('--canvas-zoom') ?? '')).toBeCloseTo(readZoom(container));
    });
    expect(readZoom(container)).toBeLessThan(1);
  });

  describe('drawn as a box', () => {
    it('names itself in a tooltip while the pointer is over it', async () => {
      stubCanvasSize(150, 150);
      renderMinimalCanvas();
      const greeting = screen.getByRole('group', { name: /^State greeting/ });
      await waitFor(() => {
        expect(greeting.closest('.react-flow')).toHaveClass('statechart-canvas__flow--shapes');
      });

      await userEvent.hover(greeting);
      expect(screen.getByRole('tooltip')).toHaveTextContent('greeting');

      await userEvent.unhover(greeting);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it("names itself in a tooltip by the state's name", async () => {
      stubCanvasSize(150, 150);
      renderCanvas(buildNamedConfig(), MINIMAL_LAYOUT);
      const greeting = screen.getByRole('group', { name: /^State Greet the user/ });
      await waitFor(() => {
        expect(greeting.closest('.react-flow')).toHaveClass('statechart-canvas__flow--shapes');
      });

      await userEvent.hover(greeting);

      expect(screen.getByRole('tooltip')).toHaveTextContent('Greet the user');
    });

    it('names itself in a tooltip while it has keyboard focus', async () => {
      stubCanvasSize(150, 150);
      renderMinimalCanvas();
      const greeting = screen.getByRole('group', { name: /^State greeting/ });
      await waitFor(() => {
        expect(greeting.closest('.react-flow')).toHaveClass('statechart-canvas__flow--shapes');
      });

      greeting.focus();

      expect(await screen.findByRole('tooltip')).toHaveTextContent('greeting');
    });

    it('shows no tooltip at a zoom that draws its name', async () => {
      renderMinimalCanvas();

      await userEvent.hover(screen.getByRole('group', { name: /^State greeting/ }));

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});

// region | Helpers
/** Builds the minimal config with a name on the root and on the greeting state, and an ambient instruction on the root. */
function buildNamedConfig(): ReturnType<typeof buildMinimalConfig> {
  const config = buildMinimalConfig();
  config.meta.name = 'Greeter';
  config.meta.ambient = [{ start: 0, end: 14 }];
  const { greeting } = config.states;
  if (greeting === undefined) throw new Error('The minimal config has no greeting state.');
  greeting.meta.name = 'Greet the user';
  return config;
}

/** Returns the branching layout with the flow `checking` moved to a vertical offset, and narrowed when a width is given. */
function withCheckingOffset(offset: number, width?: number): ElkNode {
  const layout = structuredClone(BRANCHING_LAYOUT);
  const checking = layout.children?.[0]?.children?.find(({ id }) => id === 'checking');
  if (checking === undefined) throw new Error('The branching layout lacks the flow "checking".');
  checking.y = offset;
  if (width !== undefined) checking.width = width;
  return layout;
}
// endregion | Helpers
