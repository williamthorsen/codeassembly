import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { CoderShadowNode } = await import('../CoderShadowNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'coder-shadow',
    type: 'coderShadow',
    data: {
      role: 'coder (fix cycle)',
      roleType: 'author',
      agentId: 'coder-shadow',
      status: 'completed' as const,
      phase: 'review',
      label: 'coder (fix)',
      ...data,
    },
    dragging: false,
    selected: false,
    draggable: true,
    selectable: true,
    deletable: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
}

describe('CoderShadowNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the role name', () => {
    render(<CoderShadowNode {...createNodeProps()} />);
    expect(screen.getByText('coder (fix cycle)')).toBeInTheDocument();
  });

  it('renders the loop icon', () => {
    const { container } = render(<CoderShadowNode {...createNodeProps()} />);
    // Unicode ↻ = \u21bb
    expect(container.textContent).toContain('\u21BB');
  });

  it('applies dashed border style via border shorthand', () => {
    const { container } = render(<CoderShadowNode {...createNodeProps()} />);
    const outer = container.querySelector('.flow-node');
    expect(outer).not.toBeNull();
    if (outer instanceof HTMLElement) {
      expect(outer.style.border).toContain('dashed');
    }
  });

  it('renders fixIteration badge when set', () => {
    render(<CoderShadowNode {...createNodeProps({ fixIteration: 2 })} />);
    expect(screen.getByText('fix #2')).toBeInTheDocument();
  });

  it('does not render fixIteration badge when not set', () => {
    const { container } = render(<CoderShadowNode {...createNodeProps()} />);
    expect(container.textContent).not.toContain('fix #');
  });

  it('renders StatusDot with completed class', () => {
    const { container } = render(<CoderShadowNode {...createNodeProps({ status: 'completed' })} />);
    const dot = container.querySelector('.flow-node__status-dot--completed');
    expect(dot).not.toBeNull();
  });
});
