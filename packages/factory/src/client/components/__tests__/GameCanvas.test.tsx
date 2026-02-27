import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../__test-helpers__/fixtures.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';

const {
  mockEngineConstructor,
  mockEngineStart,
  mockEngineStop,
  mockEngineAddScene,
  mockEngineGoToScene,
  mockUpdateStatus,
  mockLoadAllSprites,
} = vi.hoisted(() => {
  return {
    mockEngineConstructor: vi.fn(),
    mockEngineStart: vi.fn(),
    mockEngineStop: vi.fn(),
    mockEngineAddScene: vi.fn(),
    mockEngineGoToScene: vi.fn(),
    mockUpdateStatus: vi.fn(),
    mockLoadAllSprites: vi.fn(),
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
    DisplayMode: { FitScreen: 'FitScreen' },
  };
});

vi.mock('../../game/scenes/FactoryScene.js', () => ({
  FactoryScene: class MockFactoryScene {
    status: CanonicalRunStatus;
    updateStatus = mockUpdateStatus;
    constructor(status: CanonicalRunStatus) {
      this.status = status;
    }
  },
}));

vi.mock('../../game/sprites/agent-sprite-loader.js', () => ({
  loadAllSprites: mockLoadAllSprites,
}));

vi.mock('../GameCanvas.css', () => ({}));

const { GameCanvas } = await import('../GameCanvas.js');
const { FactoryScene } = await import('../../game/scenes/FactoryScene.js');

function getAddedScene(): unknown {
  const call = mockEngineAddScene.mock.calls.find((c: unknown[]) => c[0] === 'factory');
  return call?.[1];
}

describe('GameCanvas', () => {
  beforeEach(() => {
    mockEngineConstructor.mockClear();
    mockEngineStart.mockClear();
    mockEngineStop.mockClear();
    mockEngineAddScene.mockClear();
    mockEngineGoToScene.mockClear();
    mockUpdateStatus.mockClear();
    mockLoadAllSprites.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a canvas element', () => {
    const status = createMockRunStatus();
    const { container } = render(<GameCanvas status={status} />);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('creates an Excalibur engine on mount', () => {
    const status = createMockRunStatus();
    render(<GameCanvas status={status} />);

    expect(mockEngineConstructor).toHaveBeenCalledTimes(1);
    expect(mockEngineConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1200,
        height: 600,
      }),
    );
  });

  it('adds a FactoryScene and navigates to it', () => {
    const status = createMockRunStatus();
    render(<GameCanvas status={status} />);

    expect(mockEngineAddScene).toHaveBeenCalledWith('factory', expect.anything());
    expect(mockEngineGoToScene).toHaveBeenCalledWith('factory');
  });

  it('starts the engine after loading sprites', async () => {
    const callOrder: string[] = [];
    mockLoadAllSprites.mockImplementation(() => {
      callOrder.push('loadAllSprites');
    });
    mockEngineStart.mockImplementation(() => {
      callOrder.push('engine.start');
      return Promise.resolve();
    });

    const status = createMockRunStatus();
    render(<GameCanvas status={status} />);

    await vi.waitFor(() => {
      expect(mockLoadAllSprites).toHaveBeenCalledTimes(1);
      expect(mockEngineStart).toHaveBeenCalledTimes(1);
    });

    expect(callOrder).toEqual(['loadAllSprites', 'engine.start']);
  });

  it('stops the engine on unmount', () => {
    const status = createMockRunStatus();
    const { unmount } = render(<GameCanvas status={status} />);

    unmount();

    expect(mockEngineStop).toHaveBeenCalledTimes(1);
  });

  it('updates scene when status changes after initialization', async () => {
    const status1 = createMockRunStatus({ runId: 'run-1' });
    const status2 = createMockRunStatus({ runId: 'run-2' });

    const { rerender } = render(<GameCanvas status={status1} />);

    // Wait for engine.start() promise to resolve, setting initializedRef
    await vi.waitFor(() => {
      expect(mockEngineStart).toHaveBeenCalled();
    });
    // Allow microtask from engine.start().then() to flush
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    rerender(<GameCanvas status={status2} />);

    expect(mockUpdateStatus).toHaveBeenCalledWith(status2);
  });

  it('does not call updateStatus before engine initializes', () => {
    // Make start() return a pending promise that never resolves
    mockEngineStart.mockReturnValue(new Promise(() => {}));

    const status1 = createMockRunStatus({ runId: 'run-1' });
    const status2 = createMockRunStatus({ runId: 'run-2' });

    const { rerender } = render(<GameCanvas status={status1} />);

    // Rerender immediately without awaiting start()
    rerender(<GameCanvas status={status2} />);

    // updateStatus should NOT have been called since engine hasn't initialized
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('creates FactoryScene as an instance of the mocked class', () => {
    const status = createMockRunStatus();
    render(<GameCanvas status={status} />);

    const scene = getAddedScene();
    expect(scene).toBeDefined();
    expect(scene).toBeInstanceOf(FactoryScene);
  });
});
