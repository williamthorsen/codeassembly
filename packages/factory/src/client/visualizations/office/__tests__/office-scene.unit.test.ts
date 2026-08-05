import { describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus, Phases } from '../../../../shared/types/canonical.js';
import type { AnimationHandle, TransitionContext } from '../transitions/transition-executor.js';
import type { TransitionPlan } from '../types.js';

// Actors added/removed through the mock scene, and the transition plans handed to executeTransitions
const recorded: { actorCount: number; plans: TransitionPlan[] } = { actorCount: 0, plans: [] };
const mockExecuteTransitions = vi.fn((plan: TransitionPlan, _context: TransitionContext): AnimationHandle => {
  recorded.plans.push(plan);
  return { cancel: vi.fn() };
});

vi.mock('../transitions/transition-executor.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../transitions/transition-executor.js')>();
  return {
    ...original,
    executeTransitions: (plan: TransitionPlan, context: TransitionContext): AnimationHandle =>
      mockExecuteTransitions(plan, context),
  };
});

// Mock Excalibur to avoid canvas/WebGL dependencies in tests
vi.mock('excalibur', () => {
  class MockGraphic {
    opacity = 1;
    use() {}
  }

  /** Create chainable mock actions object. */
  function createMockActions() {
    const actions = {
      moveTo: vi.fn().mockReturnThis(),
      fade: vi.fn().mockReturnThis(),
      scaleTo: vi.fn().mockReturnThis(),
      callMethod: vi.fn().mockReturnThis(),
      clearActions: vi.fn(),
    };
    return actions;
  }

  class MockActor {
    pos = { x: 0, y: 0 };
    scale = { x: 1, y: 1 };
    graphics = new MockGraphic();
    actions = createMockActions();
    z = 0;
    constructor(opts?: { pos?: { x: number; y: number }; anchor?: { x: number; y: number }; z?: number }) {
      if (opts?.pos) this.pos = opts.pos;
      if (opts?.z !== undefined) this.z = opts.z;
    }
  }
  class MockScene {
    backgroundColor = { r: 0, g: 0, b: 0 };
    camera = { pos: { x: 0, y: 0 }, zoom: 1 };
    add(_actor: MockActor) {
      recorded.actorCount++;
    }
    remove(_actor: MockActor) {
      recorded.actorCount--;
    }
  }
  class MockCanvas {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  class MockImageSource {
    image = {};
    url: string;
    load = vi.fn().mockResolvedValue(undefined);
    constructor(url: string, _opts?: unknown) {
      this.url = url;
    }
  }
  const MockSprite = {
    from(_imageSource: unknown) {
      return {};
    },
  };

  return {
    Actor: MockActor,
    Canvas: MockCanvas,
    Color: {
      fromHex: (hex: string) => ({ hex }),
      Transparent: { hex: 'transparent' },
    },
    ImageFiltering: { Pixel: 'pixel' },
    ImageSource: MockImageSource,
    Rectangle: class {},
    Scene: MockScene,
    Sprite: MockSprite,
    SpriteSheet: {
      fromImageSource: vi.fn().mockReturnValue({
        getSprite: vi.fn().mockReturnValue({
          type: 'sprite',
          draw: vi.fn(),
        }),
      }),
    },
    vec: (x: number, y: number) => ({ x, y }),
  };
});

// Mock sprite loader to avoid real image loads
vi.mock('../sprites/office-sprite-loader.js', () => ({
  loadOfficeSprites: vi.fn().mockResolvedValue(undefined),
  getFloorSheet: vi.fn().mockReturnValue({
    getSprite: vi.fn().mockReturnValue({ type: 'sprite', draw: vi.fn() }),
  }),
  getWallSheet: vi.fn().mockReturnValue({
    getSprite: vi.fn().mockReturnValue({ type: 'sprite', draw: vi.fn() }),
  }),
  getShadowSheet: vi.fn().mockReturnValue({
    getSprite: vi.fn().mockReturnValue({ type: 'sprite', draw: vi.fn() }),
  }),
  getOfficeSheet: vi.fn().mockReturnValue({
    getSprite: vi.fn().mockReturnValue({ type: 'sprite', draw: vi.fn() }),
  }),
  getFloorImageSource: vi.fn().mockReturnValue({ image: {} }),
  getWallImageSource: vi.fn().mockReturnValue({ image: {} }),
  getShadowImageSource: vi.fn().mockReturnValue({ image: {} }),
  getOfficeImageSource: vi.fn().mockReturnValue({ image: {} }),
  getCharacterSprite: vi.fn().mockReturnValue({ type: 'sprite' }),
  getSingleSprite: vi.fn().mockReturnValue({ type: 'sprite' }),
}));

// Import after mocking
const { OfficeScene } = await import('../scene/OfficeScene.js');

/** Build empty phases with all required keys set to undefined. */
function emptyPhases(overrides: Partial<Phases> = {}): Phases {
  return {
    architecture: undefined,
    planning: undefined,
    implementation: undefined,
    parallelReview: undefined,
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
    ...overrides,
  };
}

/** Build a minimal CanonicalRunStatus for scene construction. */
function buildMinimalStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    runId: 'test-run',
    projectSlug: 'test-project',
    ticketId: '1',
    projectRoot: '/tmp/test',
    branch: 'test',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'in_progress',
    reason: undefined,
    externalPlan: undefined,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
    waitingForInput: undefined,
    phases: emptyPhases(),
    phaseDecisions: undefined,
    artifacts: undefined,
    ...overrides,
  };
}

// Minimum actor count after onInitialize: 1 background + 26 furniture + 1 orchestrator = 28
const MIN_ACTOR_COUNT_AFTER_INIT = 28;

describe('OfficeScene', () => {
  it('can be constructed', () => {
    const scene = new OfficeScene(buildMinimalStatus());
    expect(scene).toBeDefined();
  });

  it('draws background and furniture on initialize', () => {
    recorded.actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();

    // At minimum: 1 background + 26 furniture + 1 orchestrator
    expect(recorded.actorCount).toBeGreaterThanOrEqual(MIN_ACTOR_COUNT_AFTER_INIT);
  });

  it('triggers transitions with fade_in when agents are added via updateStatus', () => {
    mockExecuteTransitions.mockClear();
    recorded.plans = [];
    recorded.actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();

    // Add reviewers via parallelReview to trigger agent fade-in transitions
    scene.updateStatus(
      buildMinimalStatus({
        phases: emptyPhases({
          parallelReview: {
            aggregatedCriticality: undefined,
            reviewRoundsUsed: 1,
            coderFixCycleRan: false,
            selectiveReReview: undefined,
            reviewers: {
              codeReviewer: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              silentFailure: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              testReviewer: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
          },
        }),
      }),
    );

    expect(mockExecuteTransitions).toHaveBeenCalledTimes(1);
    expect(recorded.plans).toHaveLength(1);
    const fadeIns = recorded.plans[0]?.transitions.filter((t) => t.type === 'fade_in') ?? [];
    expect(fadeIns.length).toBeGreaterThan(0);
  });

  it('handles empty state gracefully', () => {
    recorded.actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();
    const initialCount = recorded.actorCount;

    // Should not throw; re-applying same status should not change count
    scene.updateStatus(buildMinimalStatus());

    expect(recorded.actorCount).toBe(initialCount);
  });

  it('uses transition executor for subsequent updateStatus calls with changes', () => {
    mockExecuteTransitions.mockClear();
    recorded.plans = [];
    recorded.actorCount = 0;

    // Start with 3 reviewers
    const statusWith3Reviewers = buildMinimalStatus({
      phases: emptyPhases({
        parallelReview: {
          aggregatedCriticality: undefined,
          reviewRoundsUsed: 1,
          coderFixCycleRan: false,
          selectiveReReview: undefined,
          reviewers: {
            codeReviewer: {
              ran: true,
              status: 'completed',
              criticality: 'low',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
            silentFailure: {
              ran: true,
              status: 'completed',
              criticality: 'low',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
            testReviewer: {
              ran: true,
              status: 'completed',
              criticality: 'low',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
          },
        },
      }),
    });
    const scene = new OfficeScene(statusWith3Reviewers);
    scene.onInitialize();

    // executeTransitions should not have been called for initial render
    expect(mockExecuteTransitions).not.toHaveBeenCalled();

    // Reduce to minimal status — this should trigger the transition executor
    scene.updateStatus(buildMinimalStatus());

    expect(mockExecuteTransitions).toHaveBeenCalledTimes(1);

    // Verify the plan contains fade_out transitions for removed reviewers
    expect(recorded.plans).toHaveLength(1);
    const fadeOuts = recorded.plans[0]?.transitions.filter((t) => t.type === 'fade_out') ?? [];
    expect(fadeOuts.length).toBeGreaterThan(0);
  });

  it('cancels active animation when a new updateStatus arrives mid-animation', () => {
    mockExecuteTransitions.mockClear();
    recorded.plans = [];
    recorded.actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();

    // First update: add reviewers -> triggers executeTransitions
    const cancelMock = vi.fn();
    mockExecuteTransitions.mockReturnValueOnce({ cancel: cancelMock });

    scene.updateStatus(
      buildMinimalStatus({
        phases: emptyPhases({
          parallelReview: {
            aggregatedCriticality: undefined,
            reviewRoundsUsed: 1,
            coderFixCycleRan: false,
            selectiveReReview: undefined,
            reviewers: {
              codeReviewer: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              silentFailure: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              testReviewer: {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
          },
        }),
      }),
    );

    expect(mockExecuteTransitions).toHaveBeenCalledTimes(1);

    // Second update while first animation is still "active" — should cancel it
    scene.updateStatus(buildMinimalStatus());

    expect(cancelMock).toHaveBeenCalled();
  });

  it('triggers transitions with artifact_appear when artifacts are added', () => {
    mockExecuteTransitions.mockClear();
    recorded.plans = [];
    recorded.actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();

    scene.updateStatus(
      buildMinimalStatus({
        phases: emptyPhases({
          planning: {
            status: 'completed',
            stepCount: undefined,
            artifacts: undefined,
            startedAt: '2026-01-01T00:00:00Z',
          },
        }),
        artifacts: [
          {
            phase: 'planning',
            type: 'plan',
            role: 'planner',
            filename: 'plan.md',
            roleType: 'planner',
            agent: 'planner-1',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );

    expect(mockExecuteTransitions).toHaveBeenCalledTimes(1);
    expect(recorded.plans).toHaveLength(1);
    const artifactAppears = recorded.plans[0]?.transitions.filter((t) => t.type === 'artifact_appear') ?? [];
    expect(artifactAppears.length).toBeGreaterThan(0);
  });
});
