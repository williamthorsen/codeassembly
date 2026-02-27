import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockActorConstructor,
  mockGraphicsUse,
  mockMoveTo,
  mockGetIdleAnimation,
  mockGetWalkingAnimation,
  mockGetWorkingAnimation,
  mockGetCelebratingAnimation,
  mockGetConcernedAnimation,
} = vi.hoisted(() => {
  const toPromise = vi.fn(() => Promise.resolve());
  const moveTo = vi.fn(() => ({ toPromise }));

  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
    mockMoveTo: moveTo,
    mockGetIdleAnimation: vi.fn(() => ({ id: 'idle-animation' })),
    mockGetWalkingAnimation: vi.fn(() => ({ id: 'walking-animation' })),
    mockGetWorkingAnimation: vi.fn(() => ({ id: 'working-animation' })),
    mockGetCelebratingAnimation: vi.fn(() => ({ id: 'celebrating-animation' })),
    mockGetConcernedAnimation: vi.fn(() => ({ id: 'concerned-animation' })),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: mockGraphicsUse };
    actions = { moveTo: mockMoveTo };
    constructor(config: Record<string, unknown>) {
      mockActorConstructor(config);
      this.config = config;
    }
  }

  return {
    Actor: MockActor,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

vi.mock('../../sprites/agent-sprite-loader.js', () => ({
  getIdleAnimation: mockGetIdleAnimation,
  getWalkingAnimation: mockGetWalkingAnimation,
  getWorkingAnimation: mockGetWorkingAnimation,
  getCelebratingAnimation: mockGetCelebratingAnimation,
  getConcernedAnimation: mockGetConcernedAnimation,
}));

vi.mock('../../sprites/sprite-definitions.js', () => ({}));

const { AgentActor } = await import('../AgentActor.js');
const { vec } = await import('excalibur');

describe('AgentActor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads idle animation for the given roleType on construction', () => {
    new AgentActor('architect', 'orchestrator', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('orchestrator');
    expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'idle-animation' });
  });

  it('stores agentKey as a readonly property', () => {
    const actor = new AgentActor('my-agent', 'analyst', vec(100, 200));

    expect(actor.agentKey).toBe('my-agent');
  });

  it('loads idle animation for analyst roleType', () => {
    new AgentActor('analyst-agent', 'analyst', vec(100, 200));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('analyst');
  });

  it('loads idle animation for planner roleType', () => {
    new AgentActor('planner-agent', 'planner', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('planner');
  });

  it('loads idle animation for author roleType', () => {
    new AgentActor('author-agent', 'author', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('author');
  });

  it('loads idle animation for reviewer roleType', () => {
    new AgentActor('reviewer-agent', 'reviewer', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('reviewer');
  });

  it('sets dimensions to 32x32', () => {
    new AgentActor('agent', 'analyst', vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 32,
        height: 32,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new AgentActor('agent', 'author', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });

  describe('setAnimationState', () => {
    it('switches to working animation', () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('working');

      expect(mockGetWorkingAnimation).toHaveBeenCalledWith('orchestrator');
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'working-animation' });
    });

    it('switches back to idle animation', () => {
      const actor = new AgentActor('agent', 'analyst', vec(0, 0));
      actor.setAnimationState('working');
      mockGraphicsUse.mockClear();

      actor.setAnimationState('idle');

      expect(mockGetIdleAnimation).toHaveBeenCalledWith('analyst');
      expect(mockGraphicsUse).toHaveBeenCalled();
    });

    it('switches to celebrating animation', () => {
      const actor = new AgentActor('agent', 'planner', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('celebrating');

      expect(mockGetCelebratingAnimation).toHaveBeenCalledWith('planner');
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'celebrating-animation' });
    });

    it('switches to concerned animation', () => {
      const actor = new AgentActor('agent', 'author', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('concerned');

      expect(mockGetConcernedAnimation).toHaveBeenCalledWith('author');
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'concerned-animation' });
    });

    it('does not trigger graphics.use when setting same state', () => {
      const actor = new AgentActor('agent', 'planner', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('idle');

      expect(mockGraphicsUse).not.toHaveBeenCalled();
    });

    it('does not trigger graphics.use when setting working twice', () => {
      const actor = new AgentActor('agent', 'reviewer', vec(0, 0));
      actor.setAnimationState('working');
      mockGraphicsUse.mockClear();

      actor.setAnimationState('working');

      expect(mockGraphicsUse).not.toHaveBeenCalled();
    });

    it('stores pending state when called during walk', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      const walkPromise = actor.walkTo(vec(100, 0));

      actor.setAnimationState('working');

      // No immediate graphics change during walk
      mockGraphicsUse.mockClear();
      await walkPromise;

      // After walk completes, the pending 'working' state is applied
      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'working-animation' });
    });

    it('applies latest pending state when set multiple times during walk', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      const walkPromise = actor.walkTo(vec(100, 0));

      actor.setAnimationState('working');
      actor.setAnimationState('celebrating');

      mockGraphicsUse.mockClear();
      await walkPromise;

      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'celebrating-animation' });
    });
  });

  describe('walkTo', () => {
    it('plays walking animation during movement', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockGraphicsUse.mockClear();

      await actor.walkTo(vec(200, 0));

      // First call: walking animation; second call: restore idle
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'walking-animation' });
    });

    it('calls actions.moveTo with target and speed', async () => {
      const actor = new AgentActor('agent', 'analyst', vec(0, 0));
      const target = vec(300, 100);

      await actor.walkTo(target);

      expect(mockMoveTo).toHaveBeenCalledWith(target, 100);
    });

    it('applies pending state after walk completes when set during walk', async () => {
      const actor = new AgentActor('agent', 'planner', vec(0, 0));
      const walkPromise = actor.walkTo(vec(100, 0));
      actor.setAnimationState('working');
      mockGraphicsUse.mockClear();

      await walkPromise;

      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'working-animation' });
    });

    it('restores idle animation when no pending state is set during walk', async () => {
      const actor = new AgentActor('agent', 'reviewer', vec(0, 0));
      mockGraphicsUse.mockClear();

      await actor.walkTo(vec(100, 0));

      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'idle-animation' });
    });

    it('returns immediately when called while already walking', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      const walkPromise1 = actor.walkTo(vec(100, 0));

      // Second walkTo should return immediately without calling moveTo again
      mockMoveTo.mockClear();
      const walkPromise2 = actor.walkTo(vec(200, 0));

      expect(mockMoveTo).not.toHaveBeenCalled();

      await walkPromise1;
      await walkPromise2;
    });

    it('sets isWalking flag during movement and clears after', async () => {
      const actor = new AgentActor('agent', 'analyst', vec(0, 0));
      const walkPromise = actor.walkTo(vec(100, 0));

      // During walk, setAnimationState stores as pending instead of applying directly
      actor.setAnimationState('concerned');

      await walkPromise;

      // After walk completes, we can set state directly
      mockGraphicsUse.mockClear();
      actor.setAnimationState('working');
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'working-animation' });
    });
  });
});
