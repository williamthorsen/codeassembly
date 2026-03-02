import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../FlowDiagram/FlowDiagram.css', () => ({}));

vi.mock('@xyflow/react', () => ({
  getSmoothStepPath: vi.fn(() => ['M0,0 L100,100', 50, 50, 0]),
  BaseEdge: ({ path, className, style }: { path: string; className?: string; style?: object }) =>
    React.createElement('path', {
      d: path,
      'data-testid': 'base-edge',
      className,
      style,
    }),
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

const { Position } = await import('@xyflow/react');
const { DispatchEdge } = await import('../FlowDiagram/edges/DispatchEdge.js');

const baseProps = {
  id: 'test-edge',
  source: 'node-a',
  target: 'node-b',
  type: 'dispatch' as const,
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  sourceHandleId: null,
  targetHandleId: null,
  interactionWidth: 20,
  selected: false,
  selectable: true,
  deletable: false,
  animated: false,
};

describe('DispatchEdge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders without errors for completed edge data', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge).not.toBeNull();
  });

  it('renders without errors for pending edge data', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'pending',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge).not.toBeNull();
  });

  it('applies edge-pending class when status is pending', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'pending',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge?.getAttribute('class')).toContain('edge-pending');
  });

  it('does not apply edge-pending class when status is completed', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    const classAttr = baseEdge?.getAttribute('class') ?? '';
    expect(classAttr).not.toContain('edge-pending');
  });

  it('applies edge-draw class when isNew is true', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge?.getAttribute('class')).toContain('edge-draw');
  });

  it('applies stroke color from data.color', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge).not.toBeNull();
    const style = baseEdge?.getAttribute('style') ?? '';
    // jsdom serializes hex colors to rgb(); accept either form
    expect(style).toMatch(/stroke:\s*(#FFFF55|rgb\(255,\s*255,\s*85\))/);
  });

  it('applies only edge-draw when isPending and isNew during draw animation', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'pending',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    const classAttr = baseEdge?.getAttribute('class') ?? '';
    // During draw, only edge-draw should be applied (not edge-pending)
    expect(classAttr).toContain('edge-draw');
    expect(classAttr).not.toContain('edge-pending');
  });

  it('transitions to edge-pending after draw animation completes when isPending', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'pending',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    // After draw animation completes (600ms)
    act(() => {
      vi.advanceTimersByTime(600);
    });

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    const classAttr = baseEdge?.getAttribute('class') ?? '';
    expect(classAttr).toContain('edge-pending');
    expect(classAttr).not.toContain('edge-draw');
  });

  it('does not apply edge-draw class when isNew is false', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: false,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    const classAttr = baseEdge?.getAttribute('class') ?? '';
    expect(classAttr).not.toContain('edge-draw');
  });

  it('renders PacketAnimation after draw animation completes when isNew', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    // Before draw completes, no packet
    let animateMotion = container.querySelector('animateMotion');
    expect(animateMotion).toBeNull();

    // After draw animation completes (600ms)
    act(() => {
      vi.advanceTimersByTime(600);
    });

    animateMotion = container.querySelector('animateMotion');
    expect(animateMotion).not.toBeNull();
  });

  it('removes PacketAnimation after packet completes', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    // After draw completes, packet appears
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelector('animateMotion')).not.toBeNull();

    // After packet completes (800ms default)
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(container.querySelector('animateMotion')).toBeNull();
  });

  it('wraps content in a g element for CSS variable inheritance', () => {
    const { container } = render(
      <svg>
        <DispatchEdge
          {...baseProps}
          data={{
            roleType: 'author',
            color: '#FFFF55',
            status: 'completed',
            iteration: 1,
            isNew: true,
          }}
        />
      </svg>,
    );

    // The wrapper <g> should exist, containing the hidden path and base edge
    const wrapper = container.querySelector('g');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('[data-testid="base-edge"]')).not.toBeNull();
  });
});
