import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus, Phases } from '../../../../shared/types/canonical.js';

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
      public role: string,
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

function emptyPhases(): Phases {
  return {
    architecture: undefined,
    planning: undefined,
    implementation: undefined,
    parallelReview: undefined,
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}

function createBaseStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'in_progress',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    fixLowFindings: undefined,
    phases: emptyPhases(),
    phaseDecision: {},
    ...overrides,
  };
}

function createCompletedRunPhases(): Phases {
  return {
    architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
    implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    parallelReview: {
      aggregatedCriticality: 'low',
      reviewRoundsUsed: 1,
      reviewers: {},
      coderFixCycleRan: false,
      selectiveReReview: undefined,
    },
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}

interface MockActorWithKind {
  kind?: string;
  phase?: string;
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
      const status = createBaseStatus();
      const scene = new FactoryScene(status);

      scene.onInitialize();

      // 7 stations + 6 gates + 0 agents + 0 artifacts + 1 platform = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });
  });

  describe('updateStatus', () => {
    it('clears existing actors and rebuilds the scene', () => {
      const status = createBaseStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      mockSceneAdd.mockClear();

      const updatedStatus = createBaseStatus({
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
      const status = createBaseStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 1 platform + 7 stations + 6 gates + 0 agents + 0 artifacts = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });

    it('adds correct number of actors for a completed run', () => {
      const status = createBaseStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 1 platform + 7 stations + 6 gates + 4 agents + 3 artifacts = 21
      expect(mockSceneAdd).toHaveBeenCalledTimes(21);
    });

    it('adds station actors with correct phase names', () => {
      const status = createBaseStatus();
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
      const status = createBaseStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const gateCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'gate',
      );
      expect(gateCalls).toHaveLength(6);
    });

    it('adds agent actors for active phases', () => {
      const status = createBaseStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const agentCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'agent',
      );
      expect(agentCalls).toHaveLength(4);
    });

    it('adds artifact actors for phases that produced them', () => {
      const status = createBaseStatus({
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
});
