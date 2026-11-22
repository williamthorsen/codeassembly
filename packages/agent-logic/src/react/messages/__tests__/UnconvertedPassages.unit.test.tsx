// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TestButton } from '../../test-utils/slots.tsx';
import { UnconvertedPassages } from '../UnconvertedPassages.tsx';

const PROMPT = 'Greet the user. Be warm. Mention the promotion when it feels natural.';
const PASSAGES = [
  { start: 16, end: 24, reason: 'A tone, not a step.' },
  { start: 25, end: 69, reason: 'A habit without a trigger.' },
];

describe(UnconvertedPassages, () => {
  it('counts the passages in its heading and starts with them hidden', () => {
    render(<UnconvertedPassages Button={TestButton} prompt={PROMPT} passages={PASSAGES} onShow={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Unconverted passages (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unconverted passages (2)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows and hides the passages from the keyboard, keeping its label', async () => {
    render(<UnconvertedPassages Button={TestButton} prompt={PROMPT} passages={PASSAGES} onShow={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Unconverted passages (2)' });

    toggle.focus();
    await userEvent.keyboard('{Enter}');

    expect(toggle).toHaveAccessibleName('Unconverted passages (2)');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await userEvent.keyboard(' ');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a passage in the prompt from its button', async () => {
    const onShow = vi.fn();
    render(<UnconvertedPassages Button={TestButton} prompt={PROMPT} passages={PASSAGES} onShow={onShow} />);

    await userEvent.click(screen.getByRole('button', { name: 'Unconverted passages (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show in prompt: Be warm.' }));

    expect(onShow).toHaveBeenCalledWith(PASSAGES[0]);
  });

  it('renders nothing without passages', () => {
    const { container } = render(
      <UnconvertedPassages Button={TestButton} prompt={PROMPT} passages={[]} onShow={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
