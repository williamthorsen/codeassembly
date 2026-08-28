import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it, vi } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus, emptyPhases } from '../../../../../test-utils/fixtures.js';

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
// Mock each actor module to avoid pulling in real Excalibur dependencies
vi.mock('../../actors/ArtifactActor.js', () => ({
  ArtifactActor: class MockArtifactActor {
    updateConfig = vi.fn();
    fadeIn = vi.fn();
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../actors/CatwalkStationActor.js', () => ({
  CatwalkStationActor: class MockCatwalkStationActor {
    updateConfig = vi.fn();
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../actors/ChuteActor.js', () => ({
  ChuteActor: class MockChuteActor {
    updateConfig = vi.fn();
    constructor(
      public config: unknown,
      public endpoints: unknown,
    ) {}
  },
}));

vi.mock('../../actors/FlyingArtifactActor.js', () => ({
  FlyingArtifactActor: class MockFlyingArtifactActor {
    ascend = vi.fn().mockResolvedValue(undefined);
    descend = vi.fn().mockResolvedValue(undefined);
    kill = vi.fn();
    constructor(
      public config: unknown,
      public endpoints: unknown,
      public direction: string,
    ) {}
  },
}));

vi.mock('../../actors/GateActor.js', () => ({
  GateActor: class MockGateActor {
    updateConfig = vi.fn();
    animateOpen = vi.fn();
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../actors/OrchestratorActor.js', () => ({
  OrchestratorActor: class MockOrchestratorActor {
    animateMoveTo = vi.fn().mockResolvedValue(undefined);
    fadeOut = vi.fn();
    celebrate = vi.fn();
    setWorking = vi.fn();
    setCarriedArtifacts = vi.fn();
    setCodeBadge = vi.fn();
    actions = {
      moveTo: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
    };
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../actors/StationAgentActor.js', () => ({
  StationAgentActor: class MockStationAgentActor {
    animateToState = vi.fn();
    fadeIn = vi.fn();
    constructor(
      public config: unknown,
      public position: unknown,
    ) {}
  },
}));

const { CatwalkScene } = await import('../CatwalkScene.js');
const { ArtifactActor } = await import('../../actors/ArtifactActor.js');
const { ChuteActor } = await import('../../actors/ChuteActor.js');
const { GateActor } = await import('../../actors/GateActor.js');
const { OrchestratorActor } = await import('../../actors/OrchestratorActor.js');
const { StationAgentActor } = await import('../../actors/StationAgentActor.js');
const { mapRunToCatwalk } = await import('../../mappers/run-to-catwalk.js');
const { computeCatwalkLayout } = await import('../../layout/catwalk-layout.js');
const { artifactKey } = await import('../../state/catwalk-differ.js');

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

    // 1 rail + 1 ground + 7 stations + 6 chutes + 6 agents + 1 orchestrator + 6 gates + 6 dividers = 34
    expect(scene.entities.length).toBe(34);
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

  it('scales zoom below 1 when platform exceeds viewport width', () => {
    // 5 reviewers make the review station wide enough to push platformWidth > ENGINE_WIDTH (1200)
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        parallelReview: {
          aggregatedCriticality: undefined,
          reviewRoundsUsed: 0,
          reviewers: Object.fromEntries(
            ['r-a', 'r-b', 'r-c', 'r-d', 'r-e'].map((name) => [
              name,
              {
                ran: true,
                status: undefined,
                criticality: undefined,
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            ]),
          ),
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      },
    });
    const scene = new CatwalkScene(status);
    scene.onInitialize();

    expect(scene.camera.zoom).toBeLessThan(1);
    expect(scene.camera.zoom).toBeGreaterThan(0);
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

  it('fades out orchestrator when station moves to a negative index', () => {
    // Start with an in-progress run — orchestrator at station 2 (implementation)
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

    // Transition to failed — orchestrator goes to station -1
    const status2 = createMockRunStatus({
      status: 'failed',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
      },
    });
    scene.updateStatus(status2);

    // The orchestrator should have fadeOut called instead of crashing
    const orchestrators = scene.entities.filter(
      (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
    );
    expect(orchestrators.length).toBe(1);
    const orch = orchestrators[0];
    if (orch === undefined) throw new Error('orchestrator not found');
    expect(orch.fadeOut).toHaveBeenCalled();
    expect(orch.animateMoveTo).not.toHaveBeenCalled();
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

    // Two output artifact actors + two derived input artifact actors at the next station = 4 new entities
    expect(scene.entities.length).toBe(countAfterInit + 4);

    // Four artifacts total: 2 outputs at station 0, 2 inputs at station 1
    const artifacts = scene.entities.filter((e): e is InstanceType<typeof ArtifactActor> => e instanceof ArtifactActor);
    expect(artifacts.length).toBe(4);
    // Output artifacts at station 0 should be stacked (different Y positions)
    const [a1, a2, a3, a4] = artifacts;
    if (!hasPosition(a1) || !hasPosition(a2)) throw new Error('expected artifact actors with position');
    expect(a1.position.y).not.toBe(a2.position.y);
    // Input artifacts at station 1 should also be stacked
    if (!hasPosition(a3) || !hasPosition(a4)) throw new Error('expected input artifact actors with position');
    expect(a3.position.y).not.toBe(a4.position.y);
  });

  describe('completed run with artifacts (integration)', () => {
    /** Replicate the scene's buildLayoutEntries / buildAgentCountByStation logic for verification. */
    function buildExpectedLayout(status: Parameters<typeof mapRunToCatwalk>[0]) {
      const config = mapRunToCatwalk(status);
      const agentCountByStation = new Map<number, number>();
      for (const agent of config.agents) {
        agentCountByStation.set(agent.stationIndex, (agentCountByStation.get(agent.stationIndex) ?? 0) + 1);
      }
      const entries = config.stations.map((station, index) => ({
        agentCount: agentCountByStation.get(index) ?? 0,
        ...(station.absent && { absent: true as const }),
      }));
      const layout = computeCatwalkLayout({ stations: entries });
      return { config, layout, agentCountByStation };
    }

    const completedStatus = createMockRunStatus({
      status: 'completed',
      phases: createCompletedRunPhases(),
      artifacts: [
        {
          filename: 'arch.md',
          role: 'architect',
          roleType: 'analyst',
          agent: 'arch',
          type: 'architecture',
          phase: 'architecture',
          createdAt: '2026-01-01T00:01:00Z',
        },
        {
          filename: 'plan.md',
          role: 'planner',
          roleType: 'planner',
          agent: 'planner',
          type: 'plan',
          phase: 'planning',
          createdAt: '2026-01-01T00:02:00Z',
        },
        {
          filename: 'code.md',
          role: 'coder',
          roleType: 'author',
          agent: 'coder',
          type: 'change-summary',
          phase: 'implementation',
          createdAt: '2026-01-01T00:03:00Z',
        },
        {
          filename: 'review1.md',
          role: 'reviewer',
          roleType: 'reviewer',
          agent: 'correctness-reviewer',
          type: 'review',
          phase: 'review',
          createdAt: '2026-01-01T00:04:00Z',
        },
        {
          filename: 'review2.md',
          role: 'reviewer',
          roleType: 'reviewer',
          agent: 'security-reviewer',
          type: 'review',
          phase: 'review',
          createdAt: '2026-01-01T00:05:00Z',
        },
        {
          filename: 'summary.md',
          role: 'orchestrator',
          roleType: 'orchestrator',
          agent: 'orchestrator',
          type: 'run-summary',
          phase: 'summary',
          createdAt: '2026-01-01T00:06:00Z',
        },
      ],
    });

    it('places every artifact actor at the position computed by the layout', () => {
      const { config, layout, agentCountByStation } = buildExpectedLayout(completedStatus);

      const scene = new CatwalkScene(completedStatus);
      scene.onInitialize();

      const sceneArtifacts = scene.entities.filter(
        (e): e is InstanceType<typeof ArtifactActor> => e instanceof ArtifactActor,
      );

      // Compute expected positions the same way addArtifacts does
      const countByKey = new Map<string, number>();
      const expectedPositions: { key: string; x: number; y: number }[] = [];

      for (const artifact of config.artifacts) {
        const key = artifactKey(artifact);
        const agentCount = Math.max(agentCountByStation.get(artifact.stationIndex) ?? 1, 1);

        const countKey =
          artifact.slot === 'input'
            ? `${artifact.stationIndex}:input`
            : `${artifact.stationIndex}:${artifact.agentSlotIndex}`;
        const stackIndex = countByKey.get(countKey) ?? 0;
        countByKey.set(countKey, stackIndex + 1);

        const pos =
          artifact.slot === 'input'
            ? layout.inputArtifactPosition(artifact.stationIndex, agentCount, stackIndex)
            : layout.outputArtifactPosition(artifact.stationIndex, artifact.agentSlotIndex, agentCount, stackIndex);

        expectedPositions.push({ key, x: pos.x, y: pos.y });
      }

      // Every expected artifact must appear as a scene actor at the correct position
      expect(sceneArtifacts.length).toBe(expectedPositions.length);

      for (const [i, expected] of expectedPositions.entries()) {
        const actor = sceneArtifacts[i];
        if (!hasPosition(actor)) throw new Error(`Artifact actor ${i} (${expected.key}) missing position`);
        expect(actor.position.x).toBe(expected.x);
        expect(actor.position.y).toBe(expected.y);
      }
    });

    it('separates input and output artifacts at the same station by x position', () => {
      const { config, layout, agentCountByStation } = buildExpectedLayout(completedStatus);

      const scene = new CatwalkScene(completedStatus);
      scene.onInitialize();

      const sceneArtifacts = scene.entities.filter(
        (e): e is InstanceType<typeof ArtifactActor> => e instanceof ArtifactActor,
      );

      // Find stations that have both inputs and outputs
      const stationArtifacts = new Map<number, { inputs: typeof sceneArtifacts; outputs: typeof sceneArtifacts }>();
      for (const [i, artifact] of config.artifacts.entries()) {
        const entry = stationArtifacts.get(artifact.stationIndex) ?? { inputs: [], outputs: [] };
        const actor = sceneArtifacts[i];
        if (actor === undefined) continue;
        if (artifact.slot === 'input') {
          entry.inputs.push(actor);
        } else {
          entry.outputs.push(actor);
        }
        stationArtifacts.set(artifact.stationIndex, entry);
      }

      // For each station with both inputs and outputs, verify inputs are to the left
      for (const [stationIndex, { inputs, outputs }] of stationArtifacts) {
        if (inputs.length === 0 || outputs.length === 0) continue;

        const inputX = inputs.map((a) => (hasPosition(a) ? a.position.x : 0));
        const outputX = outputs.map((a) => (hasPosition(a) ? a.position.x : 0));

        const maxInputX = Math.max(...inputX);
        const minOutputX = Math.min(...outputX);

        // Divider position check: inputs must be strictly left of outputs
        const agentCount = Math.max(agentCountByStation.get(stationIndex) ?? 1, 1);
        const divider = layout.dividerPosition(stationIndex, agentCount);

        expect(maxInputX).toBeLessThan(divider.x);
        expect(minOutputX).toBeGreaterThan(divider.x);
      }
    });

    it('triggers celebrate on orchestrator for a completed run', () => {
      const scene = new CatwalkScene(completedStatus);
      scene.onInitialize();

      const orchestrators = scene.entities.filter(
        (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
      );
      expect(orchestrators.length).toBe(1);
      const orch = orchestrators[0];
      if (orch === undefined) throw new Error('orchestrator not found');
      expect(orch.celebrate).toHaveBeenCalledOnce();
    });
  });

  describe('artifact regression (scene rebuild)', () => {
    it('rebuilds the scene when artifacts disappear between updates (backward step)', () => {
      // Start with a run that has artifacts
      const status1 = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
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
            filename: 'plan.md',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });
      const scene = new CatwalkScene(status1);
      scene.onInitialize();

      const countAfterInit = scene.entities.length;

      // Step backward: fewer artifacts
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
        ],
      });
      scene.updateStatus(status2);

      // Scene should have been rebuilt (fewer entities because fewer artifacts)
      expect(scene.entities.length).toBeLessThan(countAfterInit);

      // Verify the remaining artifact actors are correct
      const artifacts = scene.entities.filter(
        (e): e is InstanceType<typeof ArtifactActor> => e instanceof ArtifactActor,
      );
      // 1 output at station 0 + 1 input at station 1 = 2 artifacts
      expect(artifacts).toHaveLength(2);
    });

    it('rebuilds correctly when artifact regression occurs during active choreography', () => {
      // Start with empty phases (orchestrator at station 0)
      const status1 = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });
      const scene = new CatwalkScene(status1);
      scene.onInitialize();

      // Grab the orchestrator and override animateMoveTo to return a never-resolving
      // promise, keeping choreographyInProgress = true.
      const orchestrators = scene.entities.filter(
        (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
      );
      expect(orchestrators.length).toBe(1);
      const orch = orchestrators[0];
      if (orch === undefined) throw new Error('orchestrator not found');
      orch.animateMoveTo = vi.fn().mockReturnValue(new Promise<void>(() => {}));

      // Trigger choreography: architecture completed + artifact added.
      // The orchestrator moves to station 1, but animateMoveTo never resolves.
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
        ],
      });
      scene.updateStatus(status2);

      // Trigger artifact regression while choreography is still in progress.
      // This calls resetScene(), which sets choreographyInProgress = false and rebuilds.
      const status3 = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [],
      });
      scene.updateStatus(status3);

      // After rebuild, entity count should match a clean build from status3
      const cleanScene = new CatwalkScene(status3);
      cleanScene.onInitialize();
      expect(scene.entities.length).toBe(cleanScene.entities.length);

      // Forward diff: re-add architecture artifact — should work normally after rebuild
      const countAfterRebuild = scene.entities.length;
      const status4 = createMockRunStatus({
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
        ],
      });
      scene.updateStatus(status4);

      // Entity count should increase (artifact actors added via diff)
      expect(scene.entities.length).toBeGreaterThan(countAfterRebuild);
    });

    it('continues forward diffs after a rebuild', () => {
      // Start with artifacts
      const status1 = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
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
            filename: 'plan.md',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });
      const scene = new CatwalkScene(status1);
      scene.onInitialize();

      // Trigger rebuild (backward step to fewer artifacts)
      const status2 = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [],
      });
      scene.updateStatus(status2);

      const countAfterRebuild = scene.entities.length;

      // Forward step: add artifact
      const status3 = createMockRunStatus({
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
        ],
      });
      scene.updateStatus(status3);

      // Should have more entities (new artifact added via diff)
      expect(scene.entities.length).toBeGreaterThan(countAfterRebuild);
    });
  });

  describe('buffered diff drain', () => {
    /** Build an in-progress status whose completed phases advance the orchestrator's station. */
    function buildStatusAtStation(completedPhases: 'none' | 'architecture' | 'planning') {
      const phases = emptyPhases();
      if (completedPhases !== 'none') {
        phases.architecture = { status: 'completed', impactLevel: 'high', artifact: 'arch.md' };
      }
      if (completedPhases === 'planning') {
        phases.planning = { status: 'completed', stepCount: 3, artifacts: ['plan.md'] };
      }
      return createMockRunStatus({ status: 'in_progress', phases });
    }

    /** Return the scene's single orchestrator actor. */
    function findOrchestrator(scene: InstanceType<typeof CatwalkScene>) {
      const orch = scene.entities.find(
        (e): e is InstanceType<typeof OrchestratorActor> => e instanceof OrchestratorActor,
      );
      if (orch === undefined) throw new Error('orchestrator not found');
      return orch;
    }

    it('applies a diff that arrived while a choreography was in flight', async () => {
      const scene = new CatwalkScene(buildStatusAtStation('none'));
      scene.onInitialize();
      const orch = findOrchestrator(scene);

      // The second call lands while the first choreography is still awaiting, so it buffers.
      scene.updateStatus(buildStatusAtStation('architecture'));
      scene.updateStatus(buildStatusAtStation('planning'));

      await vi.waitFor(() => {
        expect(orch.animateMoveTo).toHaveBeenCalledTimes(2);
      });
    });

    it('applies the buffered diff after a choreography rejects', async () => {
      using silent = silenceConsole(['error']);

      const scene = new CatwalkScene(buildStatusAtStation('none'));
      scene.onInitialize();
      const orch = findOrchestrator(scene);
      // Gate opening runs outside the animation wrapper, so its throw rejects the choreography.
      const gates = scene.entities.filter((e): e is InstanceType<typeof GateActor> => e instanceof GateActor);
      for (const gate of gates) {
        vi.spyOn(gate, 'animateOpen').mockImplementationOnce(() => {
          throw new Error('choreography blew up');
        });
      }

      scene.updateStatus(buildStatusAtStation('architecture'));
      scene.updateStatus(buildStatusAtStation('planning'));

      await vi.waitFor(() => {
        expect(silent.error).toHaveBeenCalledWith('Choreography error:', expect.any(Error));
      });
      // The buffered diff still reaches the orchestrator despite the failed choreography.
      await vi.waitFor(() => {
        expect(orch.animateMoveTo).toHaveBeenCalledTimes(2);
      });
    });
  });
});
