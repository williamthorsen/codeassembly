import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEngineConstructor, mockEngineStart, mockEngineStop, mockEngineAddScene, mockEngineGoToScene } = vi.hoisted(
  () => {
    return {
      mockEngineConstructor: vi.fn(),
      mockEngineStart: vi.fn(),
      mockEngineStop: vi.fn(),
      mockEngineAddScene: vi.fn(),
      mockEngineGoToScene: vi.fn(),
    };
  },
);

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
  CatwalkScene: class MockCatwalkScene {},
}));

vi.mock('../GameCanvas.css', () => ({}));

const { CatwalkCanvas } = await import('../CatwalkCanvas.js');
const { CatwalkScene } = await import('../../visualizations/catwalk/scene/CatwalkScene.js');

describe('CatwalkCanvas', () => {
  beforeEach(() => {
    mockEngineConstructor.mockClear();
    mockEngineStart.mockClear();
    mockEngineStop.mockClear();
    mockEngineAddScene.mockClear();
    mockEngineGoToScene.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a canvas element', () => {
    const { container } = render(<CatwalkCanvas />);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('creates an Excalibur engine on mount', () => {
    render(<CatwalkCanvas />);

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
    render(<CatwalkCanvas />);

    expect(mockEngineAddScene).toHaveBeenCalledWith('catwalk', expect.any(CatwalkScene));
    expect(mockEngineGoToScene).toHaveBeenCalledWith('catwalk');
  });

  it('starts the engine on mount', () => {
    render(<CatwalkCanvas />);

    expect(mockEngineStart).toHaveBeenCalledTimes(1);
  });

  it('stops the engine on unmount', () => {
    const { unmount } = render(<CatwalkCanvas />);

    unmount();

    expect(mockEngineStop).toHaveBeenCalledTimes(1);
  });
});
