import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus, emptyPhases } from '../../../../__test-helpers__/fixtures.js';
import { createSceneConfig } from '../../mappers/run-to-scene.js';

const { mockSceneAdd, mockSceneClear, mockSetAnimationState, mockWalkTo, mockKill, mockFade, mockCamera } = vi.hoisted(
  () => {
    const kill = vi.fn();
    const fade = vi.fn(() => ({
      toPromise: () => Promise.resolve(),
    }));

    return {
      mockSceneAdd: vi.fn(),
      mockSceneClear: vi.fn(),
      mockSetAnimationState: vi.fn(),
      mockWalkTo: vi.fn(() => Promise.resolve()),
      mockKill: kill,
      mockFade: fade,
      mockCamera: { zoom: 1, pos: { x: 0, y: 0 } },
    };
  },
);

vi.mock('excalibur', () => {
  class MockScene {
    backgroundColor: unknown;
    add = mockSceneAdd;
    clear = mockSceneClear;
    camera = mockCamera;
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
    agentKey: string;
    setAnimationState = mockSetAnimationState;
    walkTo = mockWalkTo;
    kill = mockKill;
    actions = { fade: mockFade };
    constructor(
      agentKey: string,
      public roleType: string,
      public position: unknown,
    ) {
      this.agentKey = agentKey;
    }
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

vi.mock('../../../game/actors/PlatformActor.js', () => ({
  PlatformActor: class PlatformActor {
    kind = 'platform';
    constructor(
      public position: unknown,
      public width: number,
      public height: number,
    ) {}
  },
}));

vi.mock('../../../game/actors/LadderActor.js', () => ({
  LadderActor: class LadderActor {
    kind = 'ladder';
    constructor(
      public x: number,
      public bottomY: number,
      public topY: number,
    ) {}
  },
}));

const { FactoryScene } = await import('../FactoryScene.js');

interface MockActorWithKind {
  kind?: string;
  agentKey?: string;
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
    mockSetAnimationState.mockClear();
    mockWalkTo.mockClear();
    mockKill.mockClear();
    mockFade.mockClear();
    mockCamera.zoom = 1;
    mockCamera.pos = { x: 0, y: 0 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInitialize', () => {
    it('adds static elements and agents on first build', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);

      scene.onInitialize();

      // 7 stations + 6 gates + 0 agents + 0 artifacts + 1 platform = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });
  });

  describe('camera fitting', () => {
    it('sets camera position and zoom after initialization', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      expect(mockCamera.zoom).toBeGreaterThan(0);
      expect(mockCamera.zoom).toBeLessThanOrEqual(1);
      expect(mockCamera.pos.x).toBeGreaterThan(0);
      expect(mockCamera.pos.y).toBeGreaterThan(0);
    });

    it('updates camera after status change', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const updatedStatus = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      scene.updateStatus(updatedStatus);

      // Camera should be set (zoom and position are recomputed from layout bounds)
      expect(mockCamera.zoom).toBeGreaterThan(0);
      expect(mockCamera.zoom).toBeLessThanOrEqual(1);
      expect(mockCamera.pos.x).toBeGreaterThan(0);
      expect(mockCamera.pos.y).toBeGreaterThan(0);
    });

    it('never zooms in past 1x', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      expect(mockCamera.zoom).toBeLessThanOrEqual(1);
    });
  });

  describe('updateStatus', () => {
    it('clears and rebuilds static elements on update', () => {
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
      expect(mockSceneAdd).toHaveBeenCalled();
    });

    it('adds new agents incrementally without full scene rebuild', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      mockSceneAdd.mockClear();
      mockSceneClear.mockClear();

      const updatedStatus = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });
      scene.updateStatus(updatedStatus);

      // Static rebuild clears the scene
      expect(mockSceneClear).toHaveBeenCalledTimes(1);

      // New agents should be added (architect + orchestrator at active phase)
      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');
      expect(agentCalls).toHaveLength(2);
      const agentKeys = agentCalls.map((call: unknown[]) => getActorFromCall(call).agentKey);
      expect(agentKeys).toContain('architect');
      expect(agentKeys).toContain('orchestrator');
    });
  });

  describe('actor counts per status', () => {
    it('adds correct number of actors for empty phases', () => {
      const status = createMockRunStatus();
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 1 platform + 7 stations + 6 gates + 0 agents + 0 artifacts + 0 ladders = 14
      expect(mockSceneAdd).toHaveBeenCalledTimes(14);
    });

    it('adds correct number of actors for a completed run', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // 2 platforms (main + 1 upper for 2 reviewers) + 1 ladder + 7 stations + 6 gates + 8 agents + 3 artifacts = 27
      expect(mockSceneAdd).toHaveBeenCalledTimes(27);
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

  describe('level-based agent positioning', () => {
    it('places first reviewer on level 0 and second on level 1', () => {
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

      // First reviewer at level 0: y = 400 - 80 = 320
      // Second reviewer at level 1: y = 400 - 56 - 80 = 264
      const positions = reviewerActors.map((actor) => actor.position);
      expect(positions[0]?.y).toBe(320);
      expect(positions[1]?.y).toBe(264);
    });

    it('places level-0 agents using grid formula', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const config = createSceneConfig(status);
      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');

      expect(agentCalls).toHaveLength(config.agents.length);

      // Check level-0 agents use the grid formula
      agentCalls.forEach((call: unknown[], i: number) => {
        const actor = getActorFromCall(call);
        const agent = config.agents[i];
        if (agent === undefined || agent.level !== 0) return;
        const row = Math.floor(agent.stackOffset / 3);
        expect(actor.position).toEqual(expect.objectContaining({ y: 320 - row * 38 }));
      });
    });
  });

  describe('platforms and ladders', () => {
    it('adds platform actors for upper levels with 2+ reviewers', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const platformCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'platform',
      );
      // 2 reviewers: main platform + 1 upper platform
      expect(platformCalls).toHaveLength(2);
    });

    it('adds ladder actors connecting floors', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const ladderCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'ladder');
      // 2 reviewers: 1 ladder
      expect(ladderCalls).toHaveLength(1);
    });

    it('adds no upper platforms or ladders for single reviewer', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
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
      const scene = new FactoryScene(status);
      scene.onInitialize();

      const platformCalls = mockSceneAdd.mock.calls.filter(
        (call: unknown[]) => getActorFromCall(call).kind === 'platform',
      );
      const ladderCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'ladder');
      // 1 reviewer: only main platform, no ladders
      expect(platformCalls).toHaveLength(1);
      expect(ladderCalls).toHaveLength(0);
    });
  });

  describe('state-driven transitions', () => {
    it('sets celebrating animation on all agents when run transitions to completed', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();
      mockSetAnimationState.mockClear();

      const completedStatus = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });
      scene.updateStatus(completedStatus);

      // All setAnimationState calls should use 'celebrating'
      const celebratingCalls = mockSetAnimationState.mock.calls.filter((call: unknown[]) => call[0] === 'celebrating');
      expect(celebratingCalls.length).toBeGreaterThan(0);

      // No calls with other states (except from initial construction)
      const nonCelebratingCalls = mockSetAnimationState.mock.calls.filter(
        (call: unknown[]) => call[0] !== 'celebrating',
      );
      expect(nonCelebratingCalls).toHaveLength(0);
    });

    it('sets concerned animation on all agents when run transitions to failed', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();
      mockSetAnimationState.mockClear();

      const failedStatus = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });
      scene.updateStatus(failedStatus);

      const concernedCalls = mockSetAnimationState.mock.calls.filter((call: unknown[]) => call[0] === 'concerned');
      expect(concernedCalls.length).toBeGreaterThan(0);

      const nonConcernedCalls = mockSetAnimationState.mock.calls.filter((call: unknown[]) => call[0] !== 'concerned');
      expect(nonConcernedCalls).toHaveLength(0);
    });

    it('sets working animation on agent whose phase activates', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();
      mockSetAnimationState.mockClear();

      const updatedStatus = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
      });
      scene.updateStatus(updatedStatus);

      // At least one call with 'working' for the planner agent
      const workingCalls = mockSetAnimationState.mock.calls.filter((call: unknown[]) => call[0] === 'working');
      expect(workingCalls.length).toBeGreaterThan(0);
    });

    it('adds reviewer agents when populated from empty', () => {
      const status = createMockRunStatus({ status: 'in_progress' });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      mockSceneAdd.mockClear();

      const updatedStatus = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'security-reviewer': {
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
      scene.updateStatus(updatedStatus);

      const agentCalls = mockSceneAdd.mock.calls.filter((call: unknown[]) => getActorFromCall(call).kind === 'agent');
      const reviewerKeys = agentCalls
        .map((call: unknown[]) => getActorFromCall(call).agentKey)
        .filter((key) => key !== undefined);

      expect(reviewerKeys).toContain('correctness-reviewer');
      expect(reviewerKeys).toContain('security-reviewer');
    });

    it('fades out removed agents over 300ms before kill', async () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();

      // Update with no phases (architect removed)
      scene.updateStatus(createMockRunStatus({ status: 'in_progress' }));

      // Fade should be called with opacity 0 and 300ms duration
      expect(mockFade).toHaveBeenCalledWith(0, 300);

      // Kill is called after the fade promise resolves
      await vi.waitFor(() => {
        expect(mockKill).toHaveBeenCalled();
      });
    });

    it('triggers walkTo when an agent changes position', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 5, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
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
      const scene = new FactoryScene(status);
      scene.onInitialize();
      mockWalkTo.mockClear();

      // Add a second reviewer, which changes stackOffset of existing reviewer
      const updatedStatus = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 5, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'correctness-reviewer': {
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
      scene.updateStatus(updatedStatus);

      // correctness-reviewer moved from stackOffset 0 to stackOffset 1
      expect(mockWalkTo).toHaveBeenCalled();
    });

    it('applies setAnimationState to agents including those currently walking', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });
      const scene = new FactoryScene(status);
      scene.onInitialize();
      mockSetAnimationState.mockClear();

      // Transition to planning in_progress (architect stays, planner added)
      const updatedStatus = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
      });
      scene.updateStatus(updatedStatus);

      // setAnimationState is called on agents (the real AgentActor handles walking priority)
      expect(mockSetAnimationState).toHaveBeenCalled();
    });
  });
});
