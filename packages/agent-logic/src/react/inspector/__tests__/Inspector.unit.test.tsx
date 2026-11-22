/* eslint-disable testing-library/no-node-access -- A fact's label and its value have no accessible relation, so a test
reads the fact through its label's parent. */
// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type ConfigDescription, describeConfig, type ElementDescription } from '../../../layout/describe-config.ts';
import type { AgentLogicConfig } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { Inspector, type InspectorLinkProps } from '../Inspector.tsx';

const MINIMAL = describeConfig(buildMinimalConfig());

describe(Inspector, () => {
  it('asks for a selection when nothing is selected', () => {
    render(
      <Inspector
        LinkButton={TestLink}
        element={undefined}
        description={describeConfig(buildMinimalConfig())}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('complementary', { name: 'Selection' })).toHaveTextContent(
      'Select a state or transition, or a passage in the prompt.',
    );
  });

  it('names a state in its kinds and actions, and lists where it leads and where it comes from', () => {
    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.greeting')}
        description={MINIMAL}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'greeting' })).toBeInTheDocument();
    expect(screen.getByText('Waits for user')).toBeInTheDocument();
    expect(screen.getByText('greet the user')).toBeInTheDocument();
    const leadsTo = screen.getByText('Leads to').parentElement;
    if (leadsTo === null) throw new Error('The inspector lacks "Leads to".');
    expect(
      within(leadsTo)
        .getAllByRole('button')
        .map(({ textContent }) => textContent),
    ).toEqual(['user.replied', 'done']);
    expect(screen.getByText('Comes from').parentElement).toHaveTextContent('Comes fromNone');
  });

  it('names an ambient instruction, quotes its passage, and selects its container from a button', async () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    const description = describeConfig(config);
    const onSelect = vi.fn();
    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'meta.ambient[0]')}
        description={description}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ambient instruction' })).toBeInTheDocument();
    expect(screen.getByText('Greet the user')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'agent' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('names a transition by its trigger and its ends, and reports a missing guard as none', () => {
    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.greeting.on["user.replied"]')}
        description={MINIMAL}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'user.replied' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'greeting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'done' })).toBeInTheDocument();
    expect(screen.getByText('Guard').parentElement).toHaveTextContent('GuardNone');
  });

  it('names a gated transition and ambient instruction by the kind "Gate", and marks a gated action "gate"', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 62, end: 68, gate: true }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [
      { type: 'nl', params: { text: 'greet the user' }, meta: { source: { start: 0, end: 14 }, gate: true } },
    ];
    greeting.on = { 'user.replied': { target: '#done', meta: { source: { start: 39, end: 60 }, gate: true } } };
    const description = describeConfig(config);

    const { rerender } = render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'states.greeting')}
        description={description}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Does').parentElement).toHaveTextContent('gate greet the user');
    expect(screen.getByText('Has a gate')).toBeInTheDocument();

    rerender(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'states.greeting.on["user.replied"]')}
        description={description}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Gate')).toBeInTheDocument();

    rerender(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'meta.ambient[0]')}
        description={description}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Gate')).toBeInTheDocument();
  });

  it('names an initial waiting state and a final state by their kinds', () => {
    const { rerender } = render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.greeting')}
        description={MINIMAL}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Starts its flow')).toBeInTheDocument();

    rerender(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.done')}
        description={MINIMAL}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Ends')).toBeInTheDocument();
  });

  it('names a fallback "otherwise", lists it as a fallback, and states its guard as the alternative', () => {
    const config = buildMinimalConfig();
    const source = { start: 0, end: 5 };
    config.states = {
      ...config.states,
      greeting: {
        id: 'greeting',
        always: [
          { target: '#done', guard: { type: 'nl', params: { text: 'the user is done' } }, meta: { source } },
          { target: '#greeting', meta: { source } },
        ],
        meta: { source },
      },
    };
    const description = describeConfig(config);

    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'states.greeting.always[1]')}
        description={description}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'otherwise' })).toBeInTheDocument();
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.getByText('Guard').parentElement).toHaveTextContent(
      'Otherwise: none of the guarded siblings applies',
    );
  });

  it("names a state, and the states that it links to, by each state's name", () => {
    const config = buildMinimalConfig();
    const { greeting, done } = config.states;
    if (greeting === undefined || done === undefined) throw new Error('fixture lacks a state');
    greeting.meta.name = 'Greet the user';
    done.meta.name = 'Finish';
    const description = describeConfig(config);

    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'states.greeting')}
        description={description}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Greet the user' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('selects a state that it names when that state is clicked', async () => {
    const onSelect = vi.fn<(path: string) => void>();
    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.greeting')}
        description={MINIMAL}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'done' }));

    expect(onSelect).toHaveBeenCalledWith('states.done');
  });

  it("lists a nested state's flow-wide transitions under Any time", () => {
    const description = describeConfig(buildFlowConfig());

    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(description, 'states.handling.states.asking')}
        description={description}
        onSelect={vi.fn()}
      />,
    );

    const anyTime = screen.getByText('Any time').parentElement;
    if (anyTime === null) throw new Error('The inspector lacks "Any time".');
    expect(anyTime).toHaveTextContent('user.asks_for_humantohanded_off');
  });

  it("renders each state and transition that it names through the app's link", async () => {
    const onSelect = vi.fn<(path: string) => void>();
    render(
      <Inspector
        LinkButton={TestLink}
        element={findElement(MINIMAL, 'states.greeting')}
        description={MINIMAL}
        onSelect={onSelect}
      />,
    );

    const links = screen.getAllByRole('button');
    expect(links.map((link) => link.dataset['testLink'])).toEqual(links.map(() => ''));
    await userEvent.click(screen.getByRole('button', { name: 'user.replied' }));
    expect(onSelect).toHaveBeenCalledWith('states.greeting.on["user.replied"]');
  });
});

// region | Helpers
/** Builds a config whose flow has a transition that applies from every state inside it. */
function buildFlowConfig(): AgentLogicConfig {
  const config = buildMinimalConfig();
  config.initial = 'handling';
  config.states = {
    handling: {
      id: 'handling',
      initial: 'asking',
      on: { 'user.asks_for_human': { target: '#handed_off', meta: { source: { start: 0, end: 5 } } } },
      states: { asking: { id: 'asking', meta: { source: { start: 6, end: 10 } } } },
      meta: { source: { start: 0, end: 20 } },
    },
    handed_off: { id: 'handed_off', type: 'final', meta: { source: { start: 21, end: 30 } } },
  };
  return config;
}

/** Returns the described element at a path, failing the test when it is absent. */
function findElement(description: ConfigDescription, path: string): ElementDescription {
  const element = [...description.states, ...description.transitions, ...description.ambient].find(
    (candidate) => candidate.path === path,
  );
  if (element === undefined) throw new Error(`The description lacks "${path}".`);
  return element;
}

/** Stands in for the app's in-page link, marking each one so that a test can tell it from another button. */
function TestLink({ children, onClick }: InspectorLinkProps): ReactElement {
  return (
    <button type="button" data-test-link="" onClick={onClick}>
      {children}
    </button>
  );
}
// endregion | Helpers
