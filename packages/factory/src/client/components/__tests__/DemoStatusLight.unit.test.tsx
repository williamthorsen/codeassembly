import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackState } from '../../playback/playback-controller.ts';

vi.mock('../DemoStatusLight.css', () => ({}));

const { DemoStatusLight } = await import('../DemoStatusLight.tsx');

describe('DemoStatusLight', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a button element', () => {
    const { container } = render(<DemoStatusLight playbackState="stopped" onClick={() => {}} />);

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
  });

  it.each<PlaybackState>(['stopped', 'playing', 'paused', 'ended'])('applies correct class for %s state', (state) => {
    const { container } = render(<DemoStatusLight playbackState={state} onClick={() => {}} />);

    const button = container.querySelector('button');
    expect(button?.classList.contains(`demo-status-light--${state}`)).toBe(true);
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    const { container } = render(<DemoStatusLight playbackState="stopped" onClick={handleClick} />);

    const button = container.querySelector('button');
    if (button) {
      fireEvent.click(button);
    }

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
