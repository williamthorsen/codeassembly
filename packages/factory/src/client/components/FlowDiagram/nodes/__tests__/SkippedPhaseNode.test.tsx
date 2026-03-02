import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { SkippedPhaseNode } = await import('../SkippedPhaseNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'ghost-architecture',
    type: 'skippedPhase',
    data: {
      role: 'architect',
      roleType: 'analyst',
      agentId: 'ghost-architecture',
      status: 'skipped' as const,
      phase: 'architecture',
      label: 'architect (skipped)',
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

describe('SkippedPhaseNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the role name', () => {
    render(<SkippedPhaseNode {...createNodeProps()} />);
    expect(screen.getByText('architect')).toBeInTheDocument();
  });

  it('renders Skipped text', () => {
    render(<SkippedPhaseNode {...createNodeProps()} />);
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });

  it('applies 0.4 opacity in inline style', () => {
    const { container } = render(<SkippedPhaseNode {...createNodeProps()} />);
    const outer = container.querySelector('.flow-node');
    expect(outer).not.toBeNull();
    if (outer instanceof HTMLElement) {
      expect(outer.style.opacity).toBe('0.4');
    }
  });

  it('renders with dashed border', () => {
    const { container } = render(<SkippedPhaseNode {...createNodeProps()} />);
    const outer = container.querySelector('.flow-node');
    expect(outer).not.toBeNull();
    if (outer instanceof HTMLElement) {
      expect(outer.style.border).toContain('dashed');
    }
  });
});
