import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
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
});
