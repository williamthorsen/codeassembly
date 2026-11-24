/* eslint-disable testing-library/no-node-access -- The wrapper's class and dismissed attribute are its contract with
the stylesheet, which has no accessible query. */
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { GlossedLabel } from '../GlossedLabel.tsx';

describe(GlossedLabel, () => {
  it('describes its focusable label by its gloss', () => {
    render(<GlossedLabel label="Exits" gloss="Transitions out of this state" />);

    const label = screen.getByText('Exits');
    expect(label).toHaveAttribute('tabIndex', '0');
    expect(label).toHaveAccessibleDescription('Transitions out of this state');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Transitions out of this state');
  });

  it('opens above by default and below on request', () => {
    const { container, rerender } = render(<GlossedLabel label="Exits" gloss="Out" />);
    expect(container.firstElementChild).toHaveClass('gloss--above');

    rerender(<GlossedLabel label="Exits" gloss="Out" placement="below" />);
    expect(container.firstElementChild).toHaveClass('gloss--below');
  });

  it('dismisses on Escape while focused, until focus leaves', async () => {
    const { container } = render(<GlossedLabel label="Exits" gloss="Out" />);
    const wrapper = container.firstElementChild;

    await userEvent.tab();
    await userEvent.keyboard('{Escape}');
    expect(wrapper).toHaveAttribute('data-dismissed');

    await userEvent.tab();
    expect(wrapper).not.toHaveAttribute('data-dismissed');
  });

  it('dismisses on Escape while hovered without focus, until the pointer leaves', async () => {
    const { container } = render(<GlossedLabel label="Exits" gloss="Out" />);
    const wrapper = container.firstElementChild;

    await userEvent.hover(screen.getByText('Exits'));
    await userEvent.keyboard('{Escape}');
    expect(wrapper).toHaveAttribute('data-dismissed');

    await userEvent.unhover(screen.getByText('Exits'));
    expect(wrapper).not.toHaveAttribute('data-dismissed');
  });

  it('marks an Escape that closes the gloss as handled, and leaves a later one alone', async () => {
    render(<GlossedLabel label="Exits" gloss="Out" />);
    const prevented: boolean[] = [];
    function recordEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') prevented.push(event.defaultPrevented);
    }
    document.addEventListener('keydown', recordEscape);

    await userEvent.hover(screen.getByText('Exits'));
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    document.removeEventListener('keydown', recordEscape);

    expect(prevented).toStrictEqual([true, false]);
  });
});
