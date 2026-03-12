import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../__test-helpers__/fixtures.js';

const {
  mockEngineConstructor,
  mockEngineStart,
  mockEngineStop,
  mockEngineAddScene,
  mockEngineGoToScene,
  mockUpdateStatus,
} = vi.hoisted(() => {
  return {
    mockEngineConstructor: vi.fn(),
    mockEngineStart: vi.fn(),
    mockEngineStop: vi.fn(),
    mockEngineAddScene: vi.fn(),
    mockEngineGoToScene: vi.fn(),
    mockUpdateStatus: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockEngine {
    scenes: Record<string, unknown> = {};
    constructor(config: Record<string, unknown>) {
      mockEngineConstructor(config);
    }
    start() {
      mockEngineStart();
      return Promise.resolve();
    }
    stop() {
      mockEngineStop();
    }
    addScene(name: string, scene: unknown) {
      mockEngineAddScene(name, scene);
      this.scenes[name] = scene;
    }
    goToScene(name: string) {
      mockEngineGoToScene(name);
      return Promise.resolve();
    }
  }

  return {
    Engine: MockEngine,
    DisplayMode: { FitContainer: 'FitContainer' },
  };
});

vi.mock('../../visualizations/catwalk/scene/CatwalkScene.js', () => ({
  CatwalkScene: class MockCatwalkScene {
    updateStatus = mockUpdateStatus;
  },
}));

vi.mock('../../visualizations/catwalk/constants/dimensions.js', () => ({
  ENGINE_WIDTH: 1200,
  ENGINE_HEIGHT: 600,
}));

vi.mock('../canvas.css', () => ({}));

const { CatwalkCanvas } = await import('../CatwalkCanvas.js');
const { CatwalkScene } = await import('../../visualizations/catwalk/scene/CatwalkScene.js');

describe('CatwalkCanvas', () => {
  beforeEach(() => {
    mockEngineConstructor.mockClear();
    mockEngineStart.mockClear();
    mockEngineStop.mockClear();
    mockEngineAddScene.mockClear();
    mockEngineGoToScene.mockClear();
    mockUpdateStatus.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a canvas element', () => {
    const status = createMockRunStatus();
    const { container } = render(<CatwalkCanvas status={status} />);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('creates an Excalibur engine on mount', () => {
    const status = createMockRunStatus();
    render(<CatwalkCanvas status={status} />);

    expect(mockEngineConstructor).toHaveBeenCalledTimes(1);
    expect(mockEngineConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasElement: expect.any(HTMLCanvasElement),
        width: 1200,
        height: 600,
        displayMode: 'FitContainer',
      }),
    );
  });

  it('adds a CatwalkScene and navigates to it', () => {
    const status = createMockRunStatus();
    render(<CatwalkCanvas status={status} />);

    expect(mockEngineAddScene).toHaveBeenCalledWith('catwalk', expect.any(CatwalkScene));
    expect(mockEngineGoToScene).toHaveBeenCalledWith('catwalk');
  });

  it('starts the engine on mount', () => {
    const status = createMockRunStatus();
    render(<CatwalkCanvas status={status} />);

    expect(mockEngineStart).toHaveBeenCalledTimes(1);
  });

  it('stops the engine on unmount', () => {
    const status = createMockRunStatus();
    const { unmount } = render(<CatwalkCanvas status={status} />);

    unmount();

    expect(mockEngineStop).toHaveBeenCalledTimes(1);
  });

  it('calls updateStatus on the scene when the status prop changes', async () => {
    const initialStatus = createMockRunStatus({ status: 'in_progress' });
    const { rerender } = render(<CatwalkCanvas status={initialStatus} />);

    // Wait for engine.start() promise to resolve so initializedRef becomes true
    await act(async () => {
      await Promise.resolve();
    });

    const updatedStatus = createMockRunStatus({ runId: 'updated-run', status: 'completed' });
    rerender(<CatwalkCanvas status={updatedStatus} />);

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(updatedStatus);
  });
});
