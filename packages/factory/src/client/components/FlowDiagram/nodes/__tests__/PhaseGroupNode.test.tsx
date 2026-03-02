import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { PhaseGroupNode } = await import('../PhaseGroupNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'group-architecture',
    type: 'phaseGroup',
    data: {
      role: 'architect',
      roleType: 'analyst',
      agentId: 'group-architecture',
      status: 'completed' as const,
      phase: 'architecture',
      label: 'architecture',
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

describe('PhaseGroupNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the phase name as header text', () => {
    render(<PhaseGroupNode {...createNodeProps()} />);
    expect(screen.getByText('architecture')).toBeInTheDocument();
  });

  it('shows Completed for completed status', () => {
    render(<PhaseGroupNode {...createNodeProps({ status: 'completed' })} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows In progress... for working status', () => {
    render(<PhaseGroupNode {...createNodeProps({ status: 'working' })} />);
    expect(screen.getByText('In progress...')).toBeInTheDocument();
  });

  it('shows Pending for idle status', () => {
    render(<PhaseGroupNode {...createNodeProps({ status: 'idle' })} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows Failed for failed status', () => {
    render(<PhaseGroupNode {...createNodeProps({ status: 'failed' })} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows Skipped for skipped status', () => {
    render(<PhaseGroupNode {...createNodeProps({ status: 'skipped' })} />);
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });
});
