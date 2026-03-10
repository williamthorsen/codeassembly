import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../__test-helpers__/fixtures.js';

vi.mock('../GameCanvas.js', async () => {
  const { MockGameCanvas } = await import('../../../__test-helpers__/mock-visualization-components.js');
  return { GameCanvas: MockGameCanvas };
});

vi.mock('../../visualizations/flow/FlowDiagram.js', async () => {
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

  it('renders catwalk view by default with data-view="catwalk"', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer).not.toBeNull();
    expect(canvasContainer?.dataset.view).toBe('catwalk');
    expect(screen.getByTestId('catwalk-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
    expect(screen.queryByTestId('flow-diagram')).toBeNull();
  });

  it('switches to factory view when the Factory button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('factory');
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('catwalk-canvas')).toBeNull();
  });

  it('switches to flow view when the Flow button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('flow');
    expect(screen.getByTestId('flow-diagram')).toBeInTheDocument();
    expect(screen.queryByTestId('catwalk-canvas')).toBeNull();
  });

  it('switches back to catwalk view when the Catwalk button is clicked', () => {
    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    // Switch to factory first
    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));
    expect(container.querySelector<HTMLDivElement>('.canvas-container')?.dataset.view).toBe('factory');

    // Switch back to catwalk
    fireEvent.click(screen.getByRole('button', { name: 'Catwalk' }));
    expect(container.querySelector<HTMLDivElement>('.canvas-container')?.dataset.view).toBe('catwalk');
    expect(screen.getByTestId('catwalk-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
  });

  it('marks the active button with the "active" class', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);

    const catwalkButton = screen.getByRole('button', { name: 'Catwalk' });
    const factoryButton = screen.getByRole('button', { name: 'Factory' });
    const flowButton = screen.getByRole('button', { name: 'Flow' });

    // Catwalk is active by default
    expect(catwalkButton.className).toContain('active');
    expect(factoryButton.className).not.toContain('active');
    expect(flowButton.className).not.toContain('active');

    // Switch to factory
    fireEvent.click(factoryButton);
    expect(factoryButton.className).toContain('active');
    expect(catwalkButton.className).not.toContain('active');

    // Switch to flow
    fireEvent.click(flowButton);
    expect(flowButton.className).toContain('active');
    expect(factoryButton.className).not.toContain('active');
  });

  it('renders in factory view when URL has visualization=factory', () => {
    globalThis.history.replaceState(null, '', '/?visualization=factory');

    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('factory');
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('catwalk-canvas')).toBeNull();
  });

  it('renders in flow view when URL has visualization=flow', () => {
    globalThis.history.replaceState(null, '', '/?visualization=flow');

    const status = createMockRunStatus();
    const { container } = render(<VisualizationSwitcher status={status} />);

    const canvasContainer = container.querySelector<HTMLDivElement>('.canvas-container');
    expect(canvasContainer?.dataset.view).toBe('flow');
    expect(screen.getByTestId('flow-diagram')).toBeInTheDocument();
    expect(screen.queryByTestId('catwalk-canvas')).toBeNull();
  });

  it('updates URL param when the Factory button is clicked', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=factory');
  });

  it('updates URL param when the Flow button is clicked', () => {
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?visualization=flow');
  });

  it('removes URL param when the Catwalk button is clicked from factory view', () => {
    globalThis.history.replaceState(null, '', '/?visualization=factory');
    const status = createMockRunStatus();
    render(<VisualizationSwitcher status={status} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Catwalk' }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('forwards status to CatwalkCanvas in catwalk view', () => {
    const status = createMockRunStatus({ runId: 'forwarding-test-catwalk' });
    render(<VisualizationSwitcher status={status} />);

    expect(screen.getByTestId('catwalk-canvas').dataset.runId).toBe('forwarding-test-catwalk');
  });

  it('forwards status to GameCanvas in factory view', () => {
    const status = createMockRunStatus({ runId: 'forwarding-test-factory' });
    render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Factory' }));

    expect(screen.getByTestId('game-canvas').dataset.runId).toBe('forwarding-test-factory');
  });

  it('forwards status to FlowDiagram in flow view', () => {
    const status = createMockRunStatus({ runId: 'forwarding-test-flow' });
    render(<VisualizationSwitcher status={status} />);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    expect(screen.getByTestId('flow-diagram').dataset.runId).toBe('forwarding-test-flow');
  });
});
