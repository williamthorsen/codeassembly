import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../__test-helpers__/fixtures.js';

vi.mock('../GameCanvas.js', () => ({
  GameCanvas: function MockGameCanvas() {
    return <div data-testid="game-canvas" />;
  },
}));

vi.mock('../FlowDiagram/FlowDiagram.js', () => ({
  FlowDiagram: function MockFlowDiagram() {
    return <div data-testid="flow-diagram" />;
  },
}));

const { VisualizationSwitcher } = await import('../VisualizationSwitcher.js');

describe('VisualizationSwitcher', () => {
  const replaceStateSpy = vi.spyOn(globalThis.history, 'replaceState');

  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/');
    replaceStateSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders factory view by default with data-view="factory"', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer).not.toBeNull();
    expect(canvasContainer?.dataset.view).toBe('factory');
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-diagram')).toBeNull();
  });

  it('switches to flow view when the Flow button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('flow');
    expect(screen.getByTestId('flow-diagram')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
  });

  it('switches back to factory view when the Factory button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    // Switch to flow first
    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    expect(container.querySelector<HTMLDivElement>('.canvas-container')?.dataset.view).toBe('flow');

    // Switch back to factory
    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));
    expect(container.querySelector<HTMLDivElement>('.canvas-container')?.dataset.view).toBe('factory');
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-diagram')).toBeNull();
  });

  it('marks the active button with the "active" class', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);

    const factoryButton = screen.getByRole('button', { name: 'Factory' });
    const flowButton = screen.getByRole('button', { name: 'Flow' });

    // Factory is active by default
    expect(factoryButton.className).toContain('active');
    expect(flowButton.className).not.toContain('active');

    // Switch to flow
    fireEvent.click(flowButton);
    expect(flowButton.className).toContain('active');
    expect(factoryButton.className).not.toContain('active');
  });

  it('renders in flow view when URL has visualization=flow', () => {
    globalThis.history.replaceState(null, '', '/?visualization=flow');

    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('flow');
    expect(screen.getByTestId('flow-diagram')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
  });

  it('updates URL param when the Flow button is clicked', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=flow');
  });

  it('removes URL param when the Factory button is clicked from flow view', () => {
    globalThis.history.replaceState(null, '', '/?visualization=flow');
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });
});
