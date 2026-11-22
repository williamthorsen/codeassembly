// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import type { AgentLogicConfig, Span } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { TestButton, TestLink } from '../../test-utils/slots.tsx';
import { countMessages, hasMessages, Messages, type MessagesProps } from '../Messages.tsx';

const PROMPT_PASSAGE = { start: 0, end: 5, reason: 'A tone, not a step.' };

describe(countMessages, () => {
  it('counts the gaps, the findings, and the unconverted passages', () => {
    const config = buildMessagingConfig();

    expect(countMessages(config, describeConfig(config))).toStrictEqual({ gaps: 1, findings: 1, unconverted: 1 });
  });
});

describe(hasMessages, () => {
  it.each([
    [{ gaps: 0, findings: 0, unconverted: 0 }, false],
    [{ gaps: 0, findings: 0, unconverted: 1 }, true],
  ])('reports whether %o has a message', (counts, expected) => {
    expect(hasMessages(counts)).toBe(expected);
  });
});

describe(Messages, () => {
  it('hides the panel until its toggle opens it, under the id that the toggle names', () => {
    const { rerender } = render(<Messages {...buildProps({ isOpen: false })} />);

    expect(screen.queryByRole('region', { name: 'Messages' })).not.toBeInTheDocument();

    rerender(<Messages {...buildProps({ isOpen: true })} />);

    expect(screen.getByRole('region', { name: 'Messages' })).toHaveAttribute('id', 'messages-panel');
  });

  it('lists every kind of message, selecting and showing through its handlers', async () => {
    const onSelect = vi.fn<(path: string) => void>();
    const onShow = vi.fn<(passages: Span[]) => void>();
    render(<Messages {...buildProps({ onSelect, onShow })} />);

    expect(screen.getByRole('heading', { name: 'Gaps in the logic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Converter’s findings (1)' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'stuck' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unconverted passages (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /^Show in prompt: Greet/ }));

    expect(onSelect).toHaveBeenCalledWith('states.stuck');
    expect(onShow).toHaveBeenCalledWith([PROMPT_PASSAGE]);
  });
});

// region | Helpers
/** Builds a config with one state without an exit, one finding on the root, and one unconverted passage. */
function buildMessagingConfig(): AgentLogicConfig {
  const config = buildMinimalConfig();
  config.states = { ...config.states, stuck: { id: 'stuck', meta: { source: { start: 0, end: 5 } } } };
  config.meta.findings = [{ kind: 'contradiction', sources: [{ start: 0, end: 5 }], reason: 'The prompt says both.' }];
  config.meta.unconverted = [PROMPT_PASSAGE];
  return config;
}

/** Returns the panel's props for the messaging config, with the overrides applied. */
function buildProps(overrides: Partial<MessagesProps>): MessagesProps {
  const config = buildMessagingConfig();
  return {
    config,
    description: describeConfig(config),
    onSelect: vi.fn(),
    onShow: vi.fn(),
    id: 'messages-panel',
    isOpen: true,
    Button: TestButton,
    LinkButton: TestLink,
    ...overrides,
  };
}
// endregion | Helpers
