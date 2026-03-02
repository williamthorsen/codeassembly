import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { OrchestratorNode } = await import('../OrchestratorNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'orchestrator',
    type: 'orchestrator',
    data: {
      role: 'orchestrator',
      roleType: 'orchestrator',
      agentId: 'orchestrator',
      status: 'working' as const,
      phase: 'architecture',
      label: 'orchestrator',
      currentPhaseName: 'architecture',
      runStatus: 'in_progress',
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

describe('OrchestratorNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the Orchestrator label', () => {
    render(<OrchestratorNode {...createNodeProps()} />);
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });

  it('shows current phase name when in_progress', () => {
    render(<OrchestratorNode {...createNodeProps({ runStatus: 'in_progress', currentPhaseName: 'planning' })} />);
    expect(screen.getByText('@ planning')).toBeInTheDocument();
  });

  it('shows Complete when run is completed', () => {
    render(<OrchestratorNode {...createNodeProps({ runStatus: 'completed', status: 'completed' })} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('shows Failed when run has failed', () => {
    render(<OrchestratorNode {...createNodeProps({ runStatus: 'failed', status: 'failed' })} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('applies working glow class when in_progress', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps({ runStatus: 'in_progress' })} />);
    const outer = container.firstElementChild;
    expect(outer?.classList.contains('flow-node__glow--working')).toBe(true);
  });

  it('applies completed glow class when completed', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps({ runStatus: 'completed' })} />);
    const outer = container.firstElementChild;
    expect(outer?.classList.contains('flow-node__glow--completed')).toBe(true);
  });

  it('applies failed glow class when failed', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps({ runStatus: 'failed' })} />);
    const outer = container.firstElementChild;
    expect(outer?.classList.contains('flow-node__glow--failed')).toBe(true);
  });

  it('has a solid border style applied inline', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps()} />);
    const outer = container.querySelector('.flow-node');
    expect(outer).not.toBeNull();
    if (outer instanceof HTMLElement) {
      expect(outer.style.border).toContain('solid');
    }
  });

  it('renders no sub-label and no glow class when runStatus and currentPhaseName are absent', () => {
    const baseProps = createNodeProps();
    // Build data without optional orchestrator fields to test undefined code paths
    const { currentPhaseName: _cpn, runStatus: _rs, ...dataWithoutOrchFields } = baseProps.data;
    const { container } = render(<OrchestratorNode {...baseProps} data={dataWithoutOrchFields} />);
    const outer = container.firstElementChild;
    expect(outer?.classList.contains('flow-node__glow--working')).toBe(false);
    expect(outer?.classList.contains('flow-node__glow--completed')).toBe(false);
    expect(outer?.classList.contains('flow-node__glow--failed')).toBe(false);
    // The sub-label element should not render
    expect(container.querySelector('.flow-node__sublabel')).toBeNull();
  });

  it('renders round counter when reviewRoundsUsed and maxReviewRounds are present', () => {
    render(<OrchestratorNode {...createNodeProps({ reviewRoundsUsed: 2, maxReviewRounds: 3 })} />);
    expect(screen.getByText('Round 2/3')).toBeInTheDocument();
  });

  it('renders criticality badge when aggregatedCriticality is present', () => {
    render(
      <OrchestratorNode
        {...createNodeProps({ reviewRoundsUsed: 1, maxReviewRounds: 3, aggregatedCriticality: 'medium' })}
      />,
    );
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('does not render round counter when reviewRoundsUsed is absent', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps()} />);
    expect(container.textContent).not.toContain('Round');
  });

  it('does not render round counter when reviewRoundsUsed is present but maxReviewRounds is absent', () => {
    const { container } = render(<OrchestratorNode {...createNodeProps({ reviewRoundsUsed: 1 })} />);
    expect(container.textContent).not.toContain('Round');
  });

  it('renders criticality badge with fallback color for unknown criticality values', () => {
    render(
      <OrchestratorNode
        {...createNodeProps({ reviewRoundsUsed: 1, maxReviewRounds: 3, aggregatedCriticality: 'unknown-value' })}
      />,
    );
    expect(screen.getByText('unknown-value')).toBeInTheDocument();
  });
});
