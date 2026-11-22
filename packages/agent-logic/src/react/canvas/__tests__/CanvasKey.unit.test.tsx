// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TestButton } from '../../test-utils/slots.tsx';
import { CanvasKey, type MessageCounts } from '../CanvasKey.tsx';
import type { ChartMark } from '../list-chart-marks.ts';

const NO_MARKS = new Set<ChartMark>();

describe(CanvasKey, () => {
  it('renders nothing without marks or toggles', () => {
    const { container } = render(<CanvasKey marks={NO_MARKS} Button={TestButton} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists only the marks that the chart draws, each described by its gloss', () => {
    render(<CanvasKey marks={new Set<ChartMark>(['ends', 'waits-for-user'])} Button={TestButton} />);

    const entries = within(screen.getByRole('list', { name: 'Key' })).getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent)).toStrictEqual([
      'Waits for userThe agent waits for the user here',
      'EndsThe conversation ends here',
    ]);
    expect(screen.getByText('Ends')).toHaveAccessibleDescription('The conversation ends here');
  });

  it('shows and hides the preambles from the ambient checkbox', async () => {
    const onChange = vi.fn<(isShown: boolean) => void>();
    render(<CanvasKey marks={NO_MARKS} ambientToggle={{ count: 3, isShown: false, onChange }} Button={TestButton} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Ambient instructions (3)' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles the messages panel, stating its state and the counts that it lists', async () => {
    const onToggle = vi.fn();
    render(
      <CanvasKey
        marks={NO_MARKS}
        messagesToggle={{ counts: { gaps: 2, findings: 1, unconverted: 0 }, isOpen: true, onToggle, panelId: 'panel' }}
        Button={TestButton}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Messages' });

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'panel');
    expect(toggle).toHaveAccessibleDescription('2 gaps · 1 finding');
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it.each<[MessageCounts, string]>([
    [{ gaps: 1, findings: 2, unconverted: 1 }, '1 gap · 2 findings · 1 unconverted'],
    [{ gaps: 0, findings: 0, unconverted: 3 }, '3 unconverted'],
  ])('counts %o as "%s"', (counts, text) => {
    render(
      <CanvasKey
        marks={NO_MARKS}
        messagesToggle={{ counts, isOpen: false, onToggle: vi.fn(), panelId: 'panel' }}
        Button={TestButton}
      />,
    );

    expect(screen.getByRole('button', { name: 'Messages' })).toHaveAccessibleDescription(text);
  });
});
