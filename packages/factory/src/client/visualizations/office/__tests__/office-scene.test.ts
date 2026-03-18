import { describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus, Phases } from '../../../../shared/types/canonical.js';

// Track actors added/removed through the mock
let actorCount = 0;

// Mock Excalibur to avoid canvas/WebGL dependencies in tests
vi.mock('excalibur', () => {
  class MockGraphic {
    opacity = 1;
    use() {}
  }
  class MockActor {
    pos = { x: 0, y: 0 };
    graphics = new MockGraphic();
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
      actorCount++;
    }
    remove(_actor: MockActor) {
      actorCount--;
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
    actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();

    // At minimum: 1 background + 26 furniture + 1 orchestrator
    expect(actorCount).toBeGreaterThanOrEqual(MIN_ACTOR_COUNT_AFTER_INIT);
  });

  it('places agents from updateStatus', () => {
    actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();
    const initialCount = actorCount;

    // Add reviewers via parallelReview to get more agents
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

    // With 3 reviewers (up from the default 1), there should be at least 2 more actors
    expect(actorCount).toBeGreaterThanOrEqual(initialCount + 2);
  });

  it('handles empty state gracefully', () => {
    actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();
    const initialCount = actorCount;

    // Should not throw; re-applying same status should not change count
    scene.updateStatus(buildMinimalStatus());

    expect(actorCount).toBe(initialCount);
  });

  it('clears and replaces entities on subsequent updateStatus calls', () => {
    actorCount = 0;
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
    const withReviewersCount = actorCount;

    // Reduce to 1 default reviewer
    scene.updateStatus(buildMinimalStatus());
    const withDefaultCount = actorCount;

    // Fewer actors because 3 reviewers -> 1 default reviewer
    expect(withDefaultCount).toBeLessThan(withReviewersCount);
  });

  it('places artifacts at assigned positions', () => {
    actorCount = 0;
    const scene = new OfficeScene(buildMinimalStatus());
    scene.onInitialize();
    const initialCount = actorCount;

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

    // Should have added at least the artifact
    expect(actorCount).toBeGreaterThan(initialCount);
  });
});
