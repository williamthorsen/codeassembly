import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus } from '../../../../__test-helpers__/fixtures.js';
import { createSceneConfig } from '../../mappers/run-to-scene.js';

const { mockSceneAdd, mockSceneClear } = vi.hoisted(() => {
  return {
    mockSceneAdd: vi.fn(),
    mockSceneClear: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockScene {
    backgroundColor: unknown;
    add = mockSceneAdd;
    clear = mockSceneClear;
  }

  class MockActor {}

  class MockColor {
    hex: string;
    constructor(hex: string) {
      this.hex = hex;
    }
    static fromHex(hex: string) {
      return new MockColor(hex);
    }
  }

  return {
    Scene: MockScene,
    Actor: MockActor,
    Color: MockColor,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

vi.mock('../../../game/actors/StationActor.js', () => ({
  StationActor: class StationActor {
    kind = 'station';
    constructor(
      public phase: string,
      public active: boolean,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../../game/actors/AgentActor.js', () => ({
  AgentActor: class AgentActor {
    kind = 'agent';
    constructor(
      public roleType: string,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../../game/actors/ArtifactActor.js', () => ({
  ArtifactActor: class ArtifactActor {
    kind = 'artifact';
    constructor(
      public type: string,
      public position: unknown,
    ) {}
  },
}));

vi.mock('../../../game/actors/GateActor.js', () => ({
  GateActor: class GateActor {
    kind = 'gate';
    constructor(
      public open: boolean,
      public position: unknown,
    ) {}
  },
}));

const { FactoryScene } = await import('../FactoryScene.js');

interface MockActorWithKind {
  kind?: string;
  phase?: string;
  roleType?: string;
  position?: { x: number; y: number };
}

function hasKind(value: unknown): value is MockActorWithKind {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function getActorFromCall(call: unknown[]): MockActorWithKind {
  const actor: unknown = call[0];
  if (hasKind(actor)) {
    return actor;
  }
  return {};
}

describe('FactoryScene', () => {
  beforeEach(() => {
    mockSceneAdd.mockClear();
    mockSceneClear.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInitialize', () => {
    it('calls buildScene to add actors', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);

      scene.onInitialize();

      // 7 stations + 6 gates + 0 agents + 0 artifacts + 1 platform = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });
  });

  describe('updateStatus', () => {
    it('clears existing actors and rebuilds the scene', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      mockSceneAdd.mockClear();

      const updatedStatus = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      scene.updateStatus(updatedStatus);

      expect(mockSceneClear).toHaveBeenCalledTimes(1);
      // Rebuilds with actors
      expect(mockSceneAdd).toHaveBeenCalled();
    });
  });

  describe('actor counts per status', () => {
    it('adds correct number of actors for empty phases', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 1 platform + 7 stations + 6 gates + 0 agents + 0 artifacts = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });

    it('adds correct number of actors for a completed run', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 1 platform + 7 stations + 6 gates + 8 agents + 3 artifacts = 25
      expect(mockSceneAdd).toHaveBeenCalledTimes(25);
    });

    it('adds station actors with correct phase names', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const stationCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'station',
      );
      expect(stationCalls).toHaveLength(7);

      const phaseNames = stationCalls.map((call: unknown[]) => getActorFromCall(call).phase);
      expect(phaseNames).toEqual([
        'architecture',
        'planning',
        'implementation',
        'review',
        'simplifier',
        'holistic',
        'summary',
      ]);
    });

    it('adds gate actors between stations', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const gateCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'gate');
      expect(gateCalls).toHaveLength(6);
    });

    it('adds agent actors for active phases', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');
      // 1 architect + 1 planner + 1 coder + 2 reviewers + 1 simplifier + 1 holistic + 1 orchestrator = 8
      expect(agentCalls).toHaveLength(8);
    });

    it('adds artifact actors for phases that produced them', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const artifactCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'artifact',
      );
      expect(artifactCalls).toHaveLength(3);
    });
  });

  describe('vertical stacking', () => {
    it('stacks agents vertically at same station', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');

      // Find reviewer agents (roleType 'reviewer') at station index 3
      const reviewerActors = agentCalls
        .map((call: unknown[]) => getActorFromCall(call))
        .filter((actor) => actor.roleType === 'reviewer');

      expect(reviewerActors.length).toBeGreaterThanOrEqual(2);

      // Verify y-position formula: 320 - stackOffset * 20
      const positions = reviewerActors.map((actor) => actor.position);
      expect(positions[0]).toEqual({ x: expect.any(Number), y: 320 });
      expect(positions[1]).toEqual({ x: expect.any(Number), y: 300 });
    });

    it('applies y = 320 - stackOffset * 20 formula to all agents', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const config = createSceneConfig(status);
      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');

      expect(agentCalls).toHaveLength(config.agents.length);

      agentCalls.forEach((call: unknown[], i: number) => {
        const actor = getActorFromCall(call);
        const agent = config.agents[i];
        expect(actor.position).toEqual(expect.objectContaining({ y: 320 - (agent?.stackOffset ?? 0) * 20 }));
      });
    });
  });
});
