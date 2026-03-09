import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../FlowDiagram.css', () => ({}));

vi.mock('@xyflow/react', () => ({
  getSmoothStepPath: vi.fn(() => ['M0,0 L100,100', 50, 50, 0]),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

const { Position } = await import('@xyflow/react');
const { SpineEdge } = await import('../SpineEdge.js');

const baseProps = {
  id: 'test-spine-edge',
  source: 'orchestrator',
  target: 'orchestrator',
  type: 'spine' as const,
  sourceX: 0,
  sourceY: 0,
  targetX: 200,
  targetY: 0,
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

describe('SpineEdge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an SVG path with magenta-at-30% stroke', () => {
    const { container } = render(
      <svg>
        <SpineEdge
          {...baseProps}
          data={{
            status: 'completed',
          }}
        />
      </svg>,
    );

    const path = container.querySelector('path[d="M0,0 L100,100"]');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('stroke')).toBe('rgba(255, 85, 255, 0.3)');
    expect(path?.getAttribute('stroke-width')).toBe('1');
  });

  it('renders a marker definition for the chevron', () => {
    const { container } = render(
      <svg>
        <SpineEdge
          {...baseProps}
          data={{
            status: 'completed',
          }}
        />
      </svg>,
    );

    const marker = container.querySelector('marker');
    expect(marker).not.toBeNull();
    expect(marker?.id).toContain('spine-chevron-marker');

    const polygon = marker?.querySelector('polygon');
    expect(polygon).not.toBeNull();
  });

  it('sets pointerEvents to none on the path', () => {
    const { container } = render(
      <svg>
        <SpineEdge
          {...baseProps}
          data={{
            status: 'pending',
          }}
        />
      </svg>,
    );

    const path = container.querySelector('path[d="M0,0 L100,100"]');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('style')).toContain('pointer-events: none');
  });
});
