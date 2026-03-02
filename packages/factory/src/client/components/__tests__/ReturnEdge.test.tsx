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
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'edge-label-renderer' }, children),
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

const { Position } = await import('@xyflow/react');
const { ReturnEdge } = await import('../FlowDiagram/edges/ReturnEdge.js');

const baseProps = {
  id: 'test-return-edge',
  source: 'node-a',
  target: 'node-b',
  type: 'return' as const,
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

describe('ReturnEdge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders criticality badge when criticality is defined', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: false,
            criticality: 'medium',
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const badge = container.querySelector('.criticality-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('medium');
    expect(badge?.getAttribute('class')).toContain('criticality-medium');
  });

  it('does not render criticality badge when criticality is undefined', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: false,
            criticality: undefined,
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const badge = container.querySelector('.criticality-badge');
    expect(badge).toBeNull();
  });

  it('renders two badges with arrow when reReviewCriticality is defined', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: false,
            criticality: 'high',
            reReviewCriticality: 'low',
          }}
        />
      </svg>,
    );

    const badges = container.querySelectorAll('.criticality-badge');
    expect(badges.length).toBe(2);

    const arrow = container.querySelector('.criticality-arrow');
    expect(arrow).not.toBeNull();

    // First badge is original criticality, second is re-review
    expect(badges[0]?.textContent).toBe('high');
    expect(badges[1]?.textContent).toBe('low');
  });

  it('applies stroke color from data.color', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: false,
            criticality: undefined,
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge).not.toBeNull();
    const style = baseEdge?.getAttribute('style') ?? '';
    // jsdom serializes hex colors to rgb(); accept either form
    expect(style).toMatch(/stroke:\s*(#FF5555|rgb\(255,\s*85,\s*85\))/);
  });

  it('applies edge-draw class when isNew is true', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: true,
            criticality: undefined,
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge?.getAttribute('class')).toContain('edge-draw');
  });

  it('does not apply edge-draw class when isNew is false', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: false,
            criticality: undefined,
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    const classAttr = baseEdge?.getAttribute('class') ?? '';
    expect(classAttr).not.toContain('edge-draw');
  });

  it('applies only edge-draw when isPending and isNew during draw animation', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'pending',
            iteration: 1,
            isNew: true,
            criticality: undefined,
            reReviewCriticality: undefined,
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
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'pending',
            iteration: 1,
            isNew: true,
            criticality: undefined,
            reReviewCriticality: undefined,
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

  it('applies edge-pending class when status is pending', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'pending',
            iteration: 1,
            isNew: false,
            criticality: undefined,
            reReviewCriticality: undefined,
          }}
        />
      </svg>,
    );

    const baseEdge = container.querySelector('[data-testid="base-edge"]');
    expect(baseEdge?.getAttribute('class')).toContain('edge-pending');
  });

  it('renders PacketAnimation after draw animation completes when isNew', () => {
    const { container } = render(
      <svg>
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: true,
            criticality: undefined,
            reReviewCriticality: undefined,
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
        <ReturnEdge
          {...baseProps}
          data={{
            roleType: 'reviewer',
            color: '#FF5555',
            status: 'completed',
            iteration: 1,
            isNew: true,
            criticality: undefined,
            reReviewCriticality: undefined,
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
});
