import { describe, expect, it, vi } from 'vitest';

import { createMockRunStatus } from '../../../../../__test-helpers__/fixtures.js';

vi.mock('excalibur', () => {
  class MockScene {
    backgroundColor: unknown;
    entities: unknown[] = [];
    camera = { zoom: 1, pos: { x: 0, y: 0 } };

    add(entity: unknown) {
      this.entities.push(entity);
    }

    clear() {
      this.entities = [];
    }
  }

  class MockColor {
    hex: string;
    constructor(hex: string) {
      this.hex = hex;
    }
    static fromHex(hex: string) {
      return new MockColor(hex);
    }
  }

  class MockActor {
    config: Record<string, unknown>;
    graphics = {
      use: vi.fn(),
      opacity: 1,
    };

    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  }

  class MockRectangle {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  }

  return {
    Scene: MockScene,
    Color: MockColor,
    Actor: MockActor,
    Rectangle: MockRectangle,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

// Mock all actor imports to avoid pulling in real Excalibur dependencies
vi.mock('../../actors/index.js', () => ({
  ArtifactActor: class MockArtifactActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
  CatwalkStationActor: class MockCatwalkStationActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
  ChuteActor: class MockChuteActor {
    constructor(
      public config: unknown,
      public endpoints: unknown,
    ) {}
  },
  GateActor: class MockGateActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
  OrchestratorActor: class MockOrchestratorActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
  StationAgentActor: class MockStationAgentActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

const { CatwalkScene } = await import('../CatwalkScene.js');

describe('CatwalkScene', () => {
  it('sets the background color to #111111', () => {
    const status = createMockRunStatus();
    const scene = new CatwalkScene(status);

    expect(scene.backgroundColor).toEqual(expect.objectContaining({ hex: '#111111' }));
  });

  it('builds actors on initialize', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);

    scene.onInitialize();

    // Scene should have entities added (rail, ground line, stations, agents, etc.)
    expect(scene.entities.length).toBeGreaterThan(0);
  });

  it('clears and rebuilds on updateStatus', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    const initialCount = scene.entities.length;

    const updatedStatus = createMockRunStatus({ runId: 'new-run', status: 'completed' });
    scene.updateStatus(updatedStatus);

    // After update, should have entities again (rebuilt)
    expect(scene.entities.length).toBeGreaterThan(0);
    // Entity count may differ based on status, but scene is populated
    expect(scene.entities.length).toBeGreaterThanOrEqual(initialCount - 2);
  });

  it('fits camera to content bounds', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    // Camera should be positioned at the center of the content
    expect(scene.camera.pos.x).toBeGreaterThan(0);
    expect(scene.camera.pos.y).toBeGreaterThan(0);
    expect(scene.camera.zoom).toBeGreaterThan(0);
    expect(scene.camera.zoom).toBeLessThanOrEqual(1);
  });
});
