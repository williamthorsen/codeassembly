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

    // The gear icon uses a distinctive <path> element for the gear shape
    const gearPath = container.querySelector('g > g > path');
    expect(gearPath).not.toBeNull();
    expect(gearPath?.getAttribute('fill')).toBe('#5555FF');

    // Also verify the inner circle exists
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

  it('resets timeout when duration changes and calls onComplete only once', () => {
    const onComplete = vi.fn();

    const { rerender } = render(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" duration={800} icon="dot" color="#FF5555" onComplete={onComplete} />
      </svg>,
    );

    // Advance partway through the original duration
    vi.advanceTimersByTime(200);
    expect(onComplete).not.toHaveBeenCalled();

    // Re-render with a shorter duration
    rerender(
      <svg>
        <PacketAnimation pathD="M0,0 L100,100" duration={400} icon="dot" color="#FF5555" onComplete={onComplete} />
      </svg>,
    );

    // Advance to after the new duration completes
    vi.advanceTimersByTime(400);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Advance past what would have been the original 800ms — no second call
    vi.advanceTimersByTime(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
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
