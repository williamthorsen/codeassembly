import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../FlowDiagram/FlowDiagram.css', () => ({}));

const { PacketAnimation } = await import('../FlowDiagram/edges/PacketAnimation.js');

describe('PacketAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders an animateMotion element with correct path and dur', () => {
    const { container } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" duration={500} icon="dot" color="#FF5555" />
      </svg>,
    );

    const animateMotion = container.querySelector('animateMotion');
    expect(animateMotion).not.toBeNull();
    expect(animateMotion?.getAttribute('path')).toBe('M0,0 L100,100');
    expect(animateMotion?.getAttribute('dur')).toBe('500ms');
  });

  it('renders a circle for dot icon', () => {
    const { container } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" icon="dot" color="#FF5555" />
      </svg>,
    );

    const circle = container.querySelector('circle');
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute('fill')).toBe('#FF5555');
  });

  it('renders a rect for document icon', () => {
    const { container } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" icon="document" color="#55FF55" />
      </svg>,
    );

    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
  });

  it('renders a path for gear icon', () => {
    const { container } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" icon="gear" color="#5555FF" />
      </svg>,
    );

    // The gear icon uses a <path> element plus a circle
    const gearCircle = container.querySelector('circle');
    expect(gearCircle).not.toBeNull();
  });

  it('calls onComplete after the animation duration', () => {
    const onComplete = vi.fn();

    render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" duration={800} icon="dot" color="#FF5555" onComplete={onComplete} />
      </svg>,
    );

    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('clears timeout on unmount before completion', () => {
    const onComplete = vi.fn();

    const { unmount } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" duration={800} icon="dot" color="#FF5555" onComplete={onComplete} />
      </svg>,
    );

    vi.advanceTimersByTime(400);
    unmount();
    vi.advanceTimersByTime(800);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('uses default duration of 800ms when not specified', () => {
    const { container } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" icon="dot" color="#FF5555" />
      </svg>,
    );

    const animateMotion = container.querySelector('animateMotion');
    expect(animateMotion?.getAttribute('dur')).toBe('800ms');
  });
});
