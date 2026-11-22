// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import type { Span } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { TestButton, TestLink } from '../../test-utils/slots.tsx';
import { FindingList } from '../FindingList.tsx';

describe(FindingList, () => {
  it('renders nothing when the config has no findings', () => {
    const { container } = render(
      <FindingList
        Button={TestButton}
        LinkButton={TestLink}
        findings={describeConfig(buildMinimalConfig()).findings}
        onSelect={vi.fn()}
        onShow={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("labels the findings as the converter's judgment, each with its kind and reason", () => {
    render(
      <FindingList
        Button={TestButton}
        LinkButton={TestLink}
        findings={buildFindings()}
        onSelect={vi.fn()}
        onShow={vi.fn()}
      />,
    );

    expect(screen.getByText('Converter’s findings (2)')).toBeInTheDocument();
    expect(
      screen.getByText('Judged by the model that converted the prompt, not checked against the chart.'),
    ).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(within(items[0] ?? document.body).getByText('Contradiction')).toBeInTheDocument();
    expect(within(items[1] ?? document.body).getByText('Unhandled case')).toBeInTheDocument();
    expect(within(items[1] ?? document.body).getByText('No reply is handled.')).toBeInTheDocument();
  });

  it('marks the quotes of a finding on the root, and selects the element of a finding on a state', async () => {
    const onSelect = vi.fn<(path: string) => void>();
    const onShow = vi.fn<(passages: Span[]) => void>();
    render(
      <FindingList
        Button={TestButton}
        LinkButton={TestLink}
        findings={buildFindings()}
        onSelect={onSelect}
        onShow={onShow}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Show in prompt: The prompt says both.' }));
    await userEvent.click(screen.getByRole('button', { name: 'greeting' }));

    expect(onShow).toHaveBeenCalledWith([
      { start: 0, end: 5 },
      { start: 62, end: 68 },
    ]);
    expect(onSelect).toHaveBeenCalledWith('states.greeting');
  });
});

// region | Helpers
/** Describes a config with a contradiction on the root and an unhandled case on its greeting state. */
function buildFindings(): ReturnType<typeof describeConfig>['findings'] {
  const config = buildMinimalConfig();
  config.meta.findings = [
    {
      kind: 'contradiction',
      sources: [
        { start: 0, end: 5 },
        { start: 62, end: 68 },
      ],
      reason: 'The prompt says both.',
    },
  ];
  const { greeting } = config.states;
  if (greeting === undefined) throw new Error('The minimal config has no greeting state.');
  greeting.meta.findings = [
    { kind: 'unhandled-case', sources: [{ start: 26, end: 38 }], reason: 'No reply is handled.' },
  ];
  return describeConfig(config).findings;
}
// endregion | Helpers
