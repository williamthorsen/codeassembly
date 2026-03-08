import { describe, expect, it, vi } from 'vitest';

import { createMockRunStatus, emptyPhases } from '../../../../../__test-helpers__/fixtures.js';

const { mockLoadAllCatwalkSprites } = vi.hoisted(() => ({
  mockLoadAllCatwalkSprites: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../sprites/catwalk-sprite-loader.js', () => ({
  loadAllCatwalkSprites: mockLoadAllCatwalkSprites,
  getAnimation: vi.fn().mockReturnValue({ type: 'animation' }),
}));

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
    animateMoveTo = vi.fn();
    setWorking = vi.fn();
  },
  StationAgentActor: class MockStationAgentActor {
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
    animateToState = vi.fn();
    fadeIn = vi.fn();
  },
}));

const { CatwalkScene } = await import('../CatwalkScene.js');
const { OrchestratorActor, ChuteActor, StationAgentActor, GateActor, ArtifactActor } =
  await import('../../actors/index.js');

/** Type guard for objects that have a `config` property (all mock actors do). */
function hasConfig(value: unknown): value is { config: Record<string, unknown> } {
  return typeof value === 'object' && value !== null && 'config' in value && typeof value.config === 'object';
}

/** Type guard for objects with a config containing an id string. */
function hasIdConfig(value: unknown): value is { config: { id: string } } {
  return hasConfig(value) && 'id' in value.config && typeof value.config.id === 'string';
}

/** Type guard for dimmed config shape used by ChuteActor. */
function isDimmedConfig(value: unknown): value is { dimmed: boolean } {
  if (typeof value !== 'object' || value === null || !('dimmed' in value)) return false;
  return typeof value.dimmed === 'boolean';
}

/** Type guard for objects that have a mock `animateOpen` property. */
function hasMockAnimateOpen(value: unknown): value is { animateOpen: { mock: { calls: unknown[] } } } {
  if (typeof value !== 'object' || value === null || !('animateOpen' in value)) return false;
  const fn = value.animateOpen;
  return typeof fn === 'function' && 'mock' in fn;
}

/** Type guard for objects that have a `position` property (mock actors store position this way). */
function hasPosition(value: unknown): value is { position: { x: number; y: number } } {
  if (typeof value !== 'object' || value === null || !('position' in value)) return false;
  const pos = value.position;
  return typeof pos === 'object' && pos !== null && 'x' in pos && 'y' in pos;
}

describe('CatwalkScene', () => {
  it('sets the background color to #1a1a2e', () => {
    const status = createMockRunStatus();
    const scene = new CatwalkScene(status);

    expect(scene.backgroundColor).toEqual(expect.objectContaining({ hex: '#1a1a2e' }));
  });

  it('calls loadAllCatwalkSprites on initialize', () => {
    const status = createMockRunStatus({ status: 'in_progress' });
    const scene = new CatwalkScene(status);

    scene.onInitialize();

    expect(mockLoadAllCatwalkSprites).toHaveBeenCalledOnce();
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
    if (orch === undefined) throw new Error('orchestrator not found');
    expect(orch.animateMoveTo).toHaveBeenCalled();
  });

  it('calls setWorking on orchestrator when working state changes', () => {
    // Architecture completed, planning completed, implementation in progress with data present.
    // Current phase = implementation, data present => working = false.
    const status1 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
      },
    });
    const scene = new CatwalkScene(status1);
    scene.onInitialize();

    // Implementation completes, review not yet started => current phase = review, no data => working = true.
    const status2 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      },
    });
    scene.updateStatus(status2);

    const orchestrators = scene.entities.filter(
      (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
    );
    expect(orchestrators.length).toBe(1);
    const orch = orchestrators[0];
    if (orch === undefined) throw new Error('orchestrator not found');
    expect(orch.setWorking).toHaveBeenCalled();
  });

  it('calls animateToState("deactivated") on agent when removed by diff', () => {
    // Initialize with parallelReview that has 2 reviewers, then update with only 1.
    // The differ will detect reviewer-1 as removed.
    const status1b = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'low', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        parallelReview: {
          aggregatedCriticality: undefined,
          reviewRoundsUsed: 0,
          reviewers: {
            'reviewer-alpha': {
              ran: true,
              status: undefined,
              criticality: undefined,
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
            'reviewer-beta': {
              ran: true,
              status: undefined,
              criticality: undefined,
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
          },
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      },
    });
    const scene2 = new CatwalkScene(status1b);
    scene2.onInitialize();

    // Now update with only reviewer-alpha — reviewer-beta should be removed
    const status2b = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'low', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        parallelReview: {
          aggregatedCriticality: undefined,
          reviewRoundsUsed: 0,
          reviewers: {
            'reviewer-alpha': {
              ran: true,
              status: 'completed',
              criticality: 'low',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
          },
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      },
    });
    scene2.updateStatus(status2b);

    // Find the agent that was in the scene for reviewer-beta (reviewer-1, since it's the second reviewer)
    const agents = scene2.entities.filter(
      (e): e is InstanceType<typeof StationAgentActor> => e instanceof StationAgentActor,
    );
    // The removed agent should have had animateToState called with 'deactivated'
    const removedAgent = agents.find((a) => hasIdConfig(a) && a.config.id === 'reviewer-1');
    if (removedAgent === undefined) throw new Error('removed reviewer agent not found in entities');
    expect(removedAgent.animateToState).toHaveBeenCalledWith('deactivated');
  });

  it('calls animateOpen on gate when gate transitions from closed to open', () => {
    // Architecture not yet completed — gate between stations 0 and 1 is closed
    const status1 = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });
    const scene = new CatwalkScene(status1);
    scene.onInitialize();

    // Architecture completed — gate between station 0 and 1 opens
    const status2 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      },
    });
    scene.updateStatus(status2);

    const gates = scene.entities.filter((e): e is InstanceType<typeof GateActor> => e instanceof GateActor);
    // At least one gate should have had animateOpen called
    const openedGates = gates.filter((g) => hasMockAnimateOpen(g) && g.animateOpen.mock.calls.length > 0);
    expect(openedGates.length).toBeGreaterThan(0);
  });

  it('places diff-path artifacts at correct stacked Y positions', () => {
    // Start with a run that has no artifacts yet
    const status1 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      },
      artifacts: [],
    });
    const scene = new CatwalkScene(status1);
    scene.onInitialize();

    const countAfterInit = scene.entities.length;

    // Add two artifacts at the same station via status update
    const status2 = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      },
      artifacts: [
        {
          filename: 'arch.md',
          role: 'architect',
          roleType: 'analyst',
          agent: 'arch',
          type: 'architecture',
          phase: 'architecture',
          createdAt: '2026-01-01T00:10:00Z',
        },
        {
          filename: 'arch2.md',
          role: 'architect',
          roleType: 'analyst',
          agent: 'arch',
          type: 'plan',
          phase: 'architecture',
          createdAt: '2026-01-01T00:11:00Z',
        },
      ],
    });
    scene.updateStatus(status2);

    // Two new artifact actors should have been added
    expect(scene.entities.length).toBe(countAfterInit + 2);

    // The two artifacts should have different Y positions (stacked, not overlapping)
    const artifacts = scene.entities.filter((e): e is InstanceType<typeof ArtifactActor> => e instanceof ArtifactActor);
    expect(artifacts.length).toBe(2);
    const [a1, a2] = artifacts;
    if (!hasPosition(a1) || !hasPosition(a2)) throw new Error('expected 2 artifact actors with position');
    expect(a1.position.y).not.toBe(a2.position.y);
  });
});
