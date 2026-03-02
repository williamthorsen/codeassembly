import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { ReviewerNode } = await import('../ReviewerNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'reviewer-correctness',
    type: 'reviewer',
    data: {
      role: 'correctness-reviewer',
      roleType: 'reviewer',
      agentId: 'reviewer-correctness',
      status: 'completed' as const,
      phase: 'review',
      label: 'correctness-reviewer',
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

describe('ReviewerNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the reviewer role name', () => {
    render(<ReviewerNode {...createNodeProps()} />);
    expect(screen.getByText('correctness-reviewer')).toBeInTheDocument();
  });

  it('renders criticality badge with correct text', () => {
    render(<ReviewerNode {...createNodeProps({ criticality: 'low' })} />);
    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('renders criticality badge for none criticality', () => {
    render(<ReviewerNode {...createNodeProps({ criticality: 'none' })} />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('renders transition badge when reReviewCriticality is set', () => {
    const { container } = render(
      <ReviewerNode {...createNodeProps({ criticality: 'medium', reReviewCriticality: 'low' })} />,
    );
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
    // Arrow is rendered as &rarr; entity
    expect(container.textContent).toContain('\u2192');
  });

  it('does not render badge row when criticality is undefined', () => {
    const { container } = render(<ReviewerNode {...createNodeProps()} />);
    const badges = container.querySelectorAll('.flow-node__badge');
    expect(badges.length).toBe(0);
  });

  it('renders StatusDot with correct status class', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ status: 'working' })} />);
    const dot = container.querySelector('.flow-node__status-dot--working');
    expect(dot).not.toBeNull();
  });

  it('applies correct background color for none criticality', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ criticality: 'none' })} />);
    const badge = container.querySelector('.flow-node__badge');
    expect(badge).not.toBeNull();
    if (badge instanceof HTMLElement) {
      expect(badge.style.background).toBe('rgb(45, 164, 78)');
    }
  });

  it('applies correct background color for low criticality', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ criticality: 'low' })} />);
    const badge = container.querySelector('.flow-node__badge');
    expect(badge).not.toBeNull();
    if (badge instanceof HTMLElement) {
      expect(badge.style.background).toBe('rgb(191, 135, 0)');
    }
  });

  it('applies correct background color for medium criticality', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ criticality: 'medium' })} />);
    const badge = container.querySelector('.flow-node__badge');
    expect(badge).not.toBeNull();
    if (badge instanceof HTMLElement) {
      expect(badge.style.background).toBe('rgb(207, 34, 46)');
    }
  });

  it('applies correct background color for high criticality', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ criticality: 'high' })} />);
    const badge = container.querySelector('.flow-node__badge');
    expect(badge).not.toBeNull();
    if (badge instanceof HTMLElement) {
      expect(badge.style.background).toBe('rgb(130, 80, 223)');
    }
  });

  it('applies fallback background color for unknown criticality', () => {
    const { container } = render(<ReviewerNode {...createNodeProps({ criticality: 'unknown-value' })} />);
    const badge = container.querySelector('.flow-node__badge');
    expect(badge).not.toBeNull();
    if (badge instanceof HTMLElement) {
      expect(badge.style.background).toBe('rgb(136, 136, 136)');
    }
  });
});
