import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../__test-helpers__/fixtures.js';

vi.mock('../GameCanvas.js', async () => {
  const { MockGameCanvas } = await import('../../../__test-helpers__/mock-visualization-components.js');
  return { GameCanvas: MockGameCanvas };
});

vi.mock('../FlowDiagram/FlowDiagram.js', async () => {
  const { MockFlowDiagram } = await import('../../../__test-helpers__/mock-visualization-components.js');
  return { FlowDiagram: MockFlowDiagram };
});

vi.mock('../CatwalkCanvas.js', async () => {
  const { MockCatwalkCanvas } = await import('../../../__test-helpers__/mock-visualization-components.js');
  return { CatwalkCanvas: MockCatwalkCanvas };
});

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

  it('forwards status to GameCanvas in factory view', () => {
    const status = createMockRunStatus({ runId: 'forwarding-test-factory' });
    render(<VisualizationSwitcher status={status} />);

    expect(screen.getByTestId('game-canvas').dataset.runId).toBe('forwarding-test-factory');
  });

  it('forwards status to FlowDiagram in flow view', () => {
    const status = createMockRunStatus({ runId: 'forwarding-test-flow' });
    render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    expect(screen.getByTestId('flow-diagram').dataset.runId).toBe('forwarding-test-flow');
  });

  it('switches to catwalk view when "Catwalk" button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Catwalk' }));

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('catwalk');
    expect(screen.getByTestId('catwalk-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
    expect(screen.queryByTestId('flow-diagram')).toBeNull();
  });

  it('renders in catwalk view when URL has visualization=catwalk', () => {
    globalThis.history.replaceState(null, '', '/?visualization=catwalk');

    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('catwalk');
    expect(screen.getByTestId('catwalk-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
  });

  it('updates URL param when "Catwalk" button is clicked', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Catwalk' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=catwalk');
  });

  it('marks the "Catwalk" button with the "active" class when active', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);

    const catwalkButton = screen.getByRole('button', { name: 'Catwalk' });
    expect(catwalkButton.className).not.toContain('active');

    fireEvent.click(catwalkButton);
    expect(catwalkButton.className).toContain('active');

    const factoryButton = screen.getByRole('button', { name: 'Factory' });
    expect(factoryButton.className).not.toContain('active');
  });
});
