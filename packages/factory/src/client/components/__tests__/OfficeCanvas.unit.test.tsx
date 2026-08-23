import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../test-utils/fixtures.js';

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

vi.mock('../../visualizations/office/scene/OfficeScene.js', () => ({
  OfficeScene: class MockOfficeScene {
    updateStatus = mockUpdateStatus;
  },
}));

vi.mock('../../visualizations/office/constants/dimensions.js', () => ({
  CANVAS_WIDTH_PX: 1_152,
  CANVAS_HEIGHT_PX: 704,
  TILE_SIZE: 32,
}));

vi.mock('../canvas.css', () => ({}));

const { OfficeCanvas } = await import('../OfficeCanvas.js');
const { OfficeScene } = await import('../../visualizations/office/scene/OfficeScene.js');

describe('OfficeCanvas', () => {
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
    const { container } = render(<OfficeCanvas status={status} />);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('creates an Excalibur engine with correct canvas dimensions', () => {
    const status = createMockRunStatus();
    render(<OfficeCanvas status={status} />);

    expect(mockEngineConstructor).toHaveBeenCalledTimes(1);
    expect(mockEngineConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasElement: expect.any(HTMLCanvasElement),
        width: 1_152,
        height: 704,
        displayMode: 'FitContainer',
      }),
    );
  });

  it('adds an OfficeScene under the key "office"', () => {
    const status = createMockRunStatus();
    render(<OfficeCanvas status={status} />);

    expect(mockEngineAddScene).toHaveBeenCalledWith('office', expect.any(OfficeScene));
    expect(mockEngineGoToScene).toHaveBeenCalledWith('office');
  });

  it('starts the engine on mount', () => {
    const status = createMockRunStatus();
    render(<OfficeCanvas status={status} />);

    expect(mockEngineStart).toHaveBeenCalledTimes(1);
  });

  it('stops the engine on unmount', () => {
    const status = createMockRunStatus();
    const { unmount } = render(<OfficeCanvas status={status} />);

    unmount();

    expect(mockEngineStop).toHaveBeenCalledTimes(1);
  });

  it('calls updateStatus on the scene when the status prop changes', async () => {
    const initialStatus = createMockRunStatus({ status: 'in_progress' });
    const { rerender } = render(<OfficeCanvas status={initialStatus} />);

    // Wait for engine.start() promise to resolve so initializedRef becomes true
    await act(async () => {
      await Promise.resolve();
    });

    const updatedStatus = createMockRunStatus({ runId: 'updated-run', status: 'completed' });
    rerender(<OfficeCanvas status={updatedStatus} />);

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(updatedStatus);
  });
});
