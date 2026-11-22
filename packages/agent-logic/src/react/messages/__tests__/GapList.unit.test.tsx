// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { TestLink } from '../../test-utils/slots.tsx';
import { GapList } from '../GapList.tsx';

const SOURCE = { start: 0, end: 5 };

describe(GapList, () => {
  it('renders nothing when the config has no gaps', () => {
    const { container } = render(
      <GapList LinkButton={TestLink} description={describeConfig(buildMinimalConfig())} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("names each gap by its state's name", () => {
    const config = buildGappedConfig();
    for (const [key, state] of Object.entries(config.states)) state.meta.name = `The ${key} step`;

    render(<GapList LinkButton={TestLink} description={describeConfig(config)} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('listitem').map((item) => within(item).getByRole('button').textContent)).toStrictEqual([
      'The greeting step, always',
      'The stuck step',
    ]);
  });

  it('names each gap with its kind, and selects its element when its name is clicked', async () => {
    const onSelect = vi.fn();
    render(<GapList LinkButton={TestLink} description={describeConfig(buildGappedConfig())} onSelect={onSelect} />);

    expect(screen.getByText('Gaps in the logic')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('button').textContent)).toStrictEqual([
      'greeting, always',
      'stuck',
    ]);
    expect(
      within(items[0] ?? document.body).getByText(
        'No alternative. Only if the user is known. The prompt does not say what happens otherwise.',
      ),
    ).toBeInTheDocument();
    expect(
      within(items[1] ?? document.body).getByText(
        'No exit. Not an end, and none of its own transitions leads to another state.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'stuck' })).toHaveAttribute('data-test-link', 'inline');

    await userEvent.click(screen.getByRole('button', { name: 'stuck' }));

    expect(onSelect).toHaveBeenCalledWith('states.stuck');
  });

  it('describes an unreachable state, and both gaps of a state that has two in one entry', () => {
    const config = buildMinimalConfig();
    config.states = { ...config.states, idle: { id: 'idle', meta: { source: SOURCE } } };

    render(<GapList LinkButton={TestLink} description={describeConfig(config)} onSelect={vi.fn()} />);

    const [item] = screen.getAllByRole('listitem');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(item).toHaveTextContent(
      'idle No exit. Not an end, and none of its own transitions leads to another state. Unreachable. No transition leads to it, and no flow starts with it.',
    );
  });
});

// region | Helpers
/** Builds a config with a guarded `always` that lacks an alternative and a state without an exit. */
function buildGappedConfig(): ReturnType<typeof buildMinimalConfig> {
  const config = buildMinimalConfig();
  const { greeting } = config.states;
  if (greeting === undefined) throw new Error('The minimal config has no greeting state.');
  config.states = {
    ...config.states,
    greeting: {
      ...greeting,
      always: {
        target: '#stuck',
        guard: { type: 'nl', params: { text: 'the user is known' } },
        meta: { source: SOURCE },
      },
    },
    stuck: { id: 'stuck', meta: { source: SOURCE } },
  };
  return config;
}
// endregion | Helpers
