import { describe, expect, it, vi } from 'vitest';

import { createMockRunStatus, emptyPhases } from '../../../../../__test-helpers__/fixtures.js';

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
    updateConfig = vi.fn();
    fadeIn = vi.fn();
  },
  CatwalkStationActor: class MockCatwalkStationActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
    updateConfig = vi.fn();
  },
  ChuteActor: class MockChuteActor {
    constructor(
      public config: unknown,
      public endpoints: unknown,
    ) {}
    updateConfig = vi.fn();
  },
  GateActor: class MockGateActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
    updateConfig = vi.fn();
    animateOpen = vi.fn();
  },
  OrchestratorActor: class MockOrchestratorActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
    updateConfig = vi.fn();
    animateMoveTo = vi.fn();
    setWorking = vi.fn();
  },
  StationAgentActor: class MockStationAgentActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
    updateConfig = vi.fn();
    animateToState = vi.fn();
    fadeIn = vi.fn();
  },
}));

const { CatwalkScene } = await import('../CatwalkScene.js');
const { OrchestratorActor, ChuteActor } = await import('../../actors/index.js');

/** Type guard for objects that have a `config` property (all mock actors do). */
function hasConfig(value: unknown): value is { config: unknown } {
  return typeof value === 'object' && value !== null && 'config' in value;
}

/** Type guard for dimmed config shape used by ChuteActor. */
function isDimmedConfig(value: unknown): value is { dimmed: boolean } {
  if (typeof value !== 'object' || value === null || !('dimmed' in value)) return false;
  return typeof value.dimmed === 'boolean';
}

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

    // 1 rail + 1 ground + 7 stations + 6 chutes + 6 agents + 1 orchestrator + 6 gates = 28
    expect(scene.entities.length).toBe(28);
  });

  it('preserves entity count on updateStatus when config is unchanged', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    const initialCount = scene.entities.length;

    scene.updateStatus(status);

    // No structural changes, so entity count must remain the same
    expect(scene.entities.length).toBe(initialCount);
  });

  it('fits camera to content bounds', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    // Camera should be centered on the layout content (not at the default 0,0)
    expect(scene.camera.pos.x).toBeGreaterThan(100);
    expect(scene.camera.pos.y).toBeGreaterThan(100);
    // Zoom must be capped at 1 (content fits without magnification)
    expect(scene.camera.zoom).toBeGreaterThan(0);
    expect(scene.camera.zoom).toBeLessThanOrEqual(1);
  });

  it('does not add an orchestrator when stationIndex is negative', () => {
    // A failed run with no current phase yields stationIndex = -1
    const status = createMockRunStatus({ status: 'failed' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    const hasOrchestrator = scene.entities.some((e) => e instanceof OrchestratorActor);

    expect(hasOrchestrator).toBe(false);
  });

  it('passes dimmed=true to chutes at absent stations', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phaseDecisions: {
        architecture: { run: false, reason: 'skipped' },
      },
    });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    const chutes = scene.entities.filter((e): e is InstanceType<typeof ChuteActor> => e instanceof ChuteActor);

    // The architecture station (index 0) has one agent whose chute should be dimmed
    const dimmedChutes = chutes.filter((c) => hasConfig(c) && isDimmedConfig(c.config) && c.config.dimmed);
    expect(dimmedChutes.length).toBeGreaterThan(0);

    // Non-absent stations should have dimmed=false
    const nonDimmedChutes = chutes.filter((c) => hasConfig(c) && isDimmedConfig(c.config) && !c.config.dimmed);
    expect(nonDimmedChutes.length).toBeGreaterThan(0);
  });

  it('on second updateStatus, does not increase entity count when config is unchanged', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    const countAfterInit = scene.entities.length;

    // Second update with same status — no structural changes
    scene.updateStatus(status);
    expect(scene.entities.length).toBe(countAfterInit);
  });

  it('calls animateMoveTo on orchestrator when station changes', () => {
    // Architecture not yet completed — orchestrator inferred at station 0 (architecture)
    const status1 = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });
    const scene = new CatwalkScene(status1);
    scene.onInitialize();

    // Architecture completed — orchestrator advances to station 1 (planning)
    const status2 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      },
    });
    scene.updateStatus(status2);

    // The orchestrator should have animateMoveTo called
    const orchestrators = scene.entities.filter(
      (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
    );
    expect(orchestrators.length).toBe(1);
    const orch = orchestrators[0];
    if (orch !== undefined && 'animateMoveTo' in orch) {
      expect(orch.animateMoveTo).toHaveBeenCalled();
    }
  });
});
