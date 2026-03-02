import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowNodeData } from '../../mappers/run-to-flow.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../nodes.css', () => ({}));

const { PhaseAgentNode } = await import('../PhaseAgentNode.js');

function createNodeProps(data: Partial<FlowNodeData> = {}) {
  return {
    id: 'agent-architecture',
    type: 'phaseAgent',
    data: {
      role: 'architect',
      roleType: 'analyst',
      agentId: 'agent-architecture',
      status: 'completed' as const,
      phase: 'architecture',
      label: 'architect',
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

describe('PhaseAgentNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the role name', () => {
    render(<PhaseAgentNode {...createNodeProps()} />);
    expect(screen.getByText('architect')).toBeInTheDocument();
  });

  it('renders the agent ID in sublabel', () => {
    render(<PhaseAgentNode {...createNodeProps()} />);
    expect(screen.getByText('agent-architecture')).toBeInTheDocument();
  });

  it('renders StatusDot with completed class', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ status: 'completed' })} />);
    const dot = container.querySelector('.flow-node__status-dot--completed');
    expect(dot).not.toBeNull();
  });

  it('renders StatusDot with working class', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ status: 'working' })} />);
    const dot = container.querySelector('.flow-node__status-dot--working');
    expect(dot).not.toBeNull();
  });

  it('renders StatusDot with idle class', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ status: 'idle' })} />);
    const dot = container.querySelector('.flow-node__status-dot--idle');
    expect(dot).not.toBeNull();
  });

  it('renders StatusDot with failed class', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ status: 'failed' })} />);
    const dot = container.querySelector('.flow-node__status-dot--failed');
    expect(dot).not.toBeNull();
  });

  it('renders StatusDot with skipped class', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ status: 'skipped' })} />);
    const dot = container.querySelector('.flow-node__status-dot--skipped');
    expect(dot).not.toBeNull();
  });

  it('renders impactLevel badge for architecture phase', () => {
    render(<PhaseAgentNode {...createNodeProps({ phase: 'architecture', impactLevel: 'high' })} />);
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('does not render impactLevel badge when not set', () => {
    const { container } = render(<PhaseAgentNode {...createNodeProps({ phase: 'architecture' })} />);
    expect(container.textContent).not.toContain('high');
  });

  it('renders stepCount badge for planning phase', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({ phase: 'planning', role: 'planner', roleType: 'planner', stepCount: 7 })}
      />,
    );
    expect(screen.getByText('7 steps')).toBeInTheDocument();
  });

  it('renders quality gate indicators for implementation phase', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'implementation',
          role: 'coder',
          roleType: 'author',
          qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'fail' },
        })}
      />,
    );
    expect(screen.getByText('TC')).toBeInTheDocument();
    expect(screen.getByText('LI')).toBeInTheDocument();
    expect(screen.getByText('TE')).toBeInTheDocument();
  });

  it('does not render quality gates when qualityGates is a string', () => {
    const { container } = render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'implementation',
          role: 'coder',
          roleType: 'author',
          qualityGates: 'N/A',
        })}
      />,
    );
    expect(container.querySelector('.flow-node__badge')).toBeNull();
  });

  it('marks passing quality gates with data-gate-status pass', () => {
    const { container } = render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'implementation',
          role: 'coder',
          roleType: 'author',
          qualityGates: { typecheck: 'pass', lint: 'passed', tests: 'pass' },
        })}
      />,
    );
    const tc = screen.getByText('TC');
    const li = screen.getByText('LI');
    const te = screen.getByText('TE');
    expect(tc.getAttribute('data-gate-status')).toBe('pass');
    expect(li.getAttribute('data-gate-status')).toBe('pass');
    expect(te.getAttribute('data-gate-status')).toBe('pass');
    // Verify the container element exists
    expect(container.querySelector('.flow-node__badge')).not.toBeNull();
  });

  it('marks failing quality gates with data-gate-status fail', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'implementation',
          role: 'coder',
          roleType: 'author',
          qualityGates: { typecheck: 'fail', lint: 'fail', tests: 'fail' },
        })}
      />,
    );
    const tc = screen.getByText('TC');
    const li = screen.getByText('LI');
    const te = screen.getByText('TE');
    expect(tc.getAttribute('data-gate-status')).toBe('fail');
    expect(li.getAttribute('data-gate-status')).toBe('fail');
    expect(te.getAttribute('data-gate-status')).toBe('fail');
  });

  it('marks undefined quality gates with data-gate-status unknown', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'implementation',
          role: 'coder',
          roleType: 'author',
          qualityGates: { typecheck: undefined, lint: undefined, tests: undefined },
        })}
      />,
    );
    const tc = screen.getByText('TC');
    const li = screen.getByText('LI');
    const te = screen.getByText('TE');
    expect(tc.getAttribute('data-gate-status')).toBe('unknown');
    expect(li.getAttribute('data-gate-status')).toBe('unknown');
    expect(te.getAttribute('data-gate-status')).toBe('unknown');
  });

  it('does not render impactLevel badge when phase is planning', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'planning',
          role: 'planner',
          roleType: 'planner',
          impactLevel: 'high',
        })}
      />,
    );
    expect(screen.queryByText('high')).not.toBeInTheDocument();
  });

  it('does not render stepCount badge when phase is architecture', () => {
    render(
      <PhaseAgentNode
        {...createNodeProps({
          phase: 'architecture',
          stepCount: 5,
        })}
      />,
    );
    expect(screen.queryByText('5 steps')).not.toBeInTheDocument();
  });
});
