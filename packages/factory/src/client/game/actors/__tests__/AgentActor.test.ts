import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockActorConstructor,
  mockGraphicsUse,
  mockMoveTo,
  mockClearActions,
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
    mockClearActions: vi.fn(),
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
    pos: { x: number; y: number };
    graphics = { use: mockGraphicsUse };
    actions = { moveTo: mockMoveTo, clearActions: mockClearActions };
    constructor(config: Record<string, unknown>) {
      mockActorConstructor(config);
      this.config = config;
      const pos = config.pos;
      if (typeof pos === 'object' && pos !== null && 'x' in pos && 'y' in pos) {
        const { x, y } = pos;
        this.pos = { x: typeof x === 'number' ? x : 0, y: typeof y === 'number' ? y : 0 };
      } else {
        this.pos = { x: 0, y: 0 };
      }
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

  describe('walkPath', () => {
    it('returns immediately for empty waypoints without changing animation', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockGraphicsUse.mockClear();

      await actor.walkPath([]);

      expect(mockMoveTo).not.toHaveBeenCalled();
      expect(mockGraphicsUse).not.toHaveBeenCalled();
    });

    it('calls moveTo for non-teleport waypoint', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));

      await actor.walkPath([{ x: 200, y: 0, teleport: false }]);

      expect(mockMoveTo).toHaveBeenCalledWith({ x: 200, y: 0 }, 100);
    });

    it('sets position directly for teleport waypoint without calling moveTo', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockMoveTo.mockClear();

      await actor.walkPath([{ x: 300, y: 100, teleport: true }]);

      expect(mockMoveTo).not.toHaveBeenCalled();
      expect(actor.pos).toEqual({ x: 300, y: 100 });
    });

    it('calls moveTo for each non-teleport waypoint in sequence', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockMoveTo.mockClear();

      await actor.walkPath([
        { x: 100, y: 0, teleport: false },
        { x: 100, y: 200, teleport: true },
        { x: 300, y: 200, teleport: false },
      ]);

      // moveTo called for first and third waypoints (second is teleport)
      expect(mockMoveTo).toHaveBeenCalledTimes(2);
      expect(mockMoveTo).toHaveBeenNthCalledWith(1, { x: 100, y: 0 }, 100);
      expect(mockMoveTo).toHaveBeenNthCalledWith(2, { x: 300, y: 200 }, 100);
      // Teleport waypoint updated position directly (moveTo mock does not update pos)
      expect(actor.pos).toEqual({ x: 100, y: 200 });
    });

    it('plays walking animation at start and restores idle after completion', async () => {
      const actor = new AgentActor('agent', 'reviewer', vec(0, 0));
      mockGraphicsUse.mockClear();

      await actor.walkPath([{ x: 200, y: 0, teleport: false }]);

      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'walking-animation' });
      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'idle-animation' });
    });

    it('applies pending state after walk completes', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      const walkPromise = actor.walkPath([{ x: 200, y: 0, teleport: false }]);

      actor.setAnimationState('working');

      mockGraphicsUse.mockClear();
      await walkPromise;

      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'working-animation' });
    });

    it('cancels previous walk and starts new path when called during walk', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));

      // Start first walk
      const walk1 = actor.walkPath([{ x: 100, y: 0, teleport: false }]);

      // Start second walk (should cancel first)
      mockMoveTo.mockClear();
      const walk2 = actor.walkPath([{ x: 500, y: 0, teleport: false }]);

      expect(mockClearActions).toHaveBeenCalled();
      expect(mockMoveTo).toHaveBeenCalledWith({ x: 500, y: 0 }, 100);

      await walk1;
      await walk2;
    });

    it('skips zero-distance waypoint', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(100, 200));
      mockMoveTo.mockClear();

      await actor.walkPath([{ x: 100, y: 200, teleport: false }]);

      expect(mockMoveTo).not.toHaveBeenCalled();
    });

    it('skips waypoint within POSITION_TOLERANCE but walks to one beyond it', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(100, 200));
      mockMoveTo.mockClear();

      await actor.walkPath([
        { x: 100.5, y: 200, teleport: false }, // within 1px tolerance, should skip
        { x: 102, y: 200, teleport: false }, // beyond tolerance, should walk
      ]);

      expect(mockMoveTo).toHaveBeenCalledTimes(1);
      expect(mockMoveTo).toHaveBeenCalledWith({ x: 102, y: 200 }, 100);
    });

    it('does not process remaining waypoints from cancelled walk', async () => {
      let resolveFirstMove: (() => void) | undefined;
      const firstMovePromise = new Promise<void>((resolve) => {
        resolveFirstMove = resolve;
      });

      const actor = new AgentActor('agent', 'orchestrator', vec(0, 0));
      mockMoveTo.mockClear();

      // First call blocks, subsequent calls resolve immediately
      mockMoveTo.mockReturnValueOnce({ toPromise: vi.fn(() => firstMovePromise) });
      mockMoveTo.mockReturnValue({ toPromise: vi.fn(() => Promise.resolve()) });

      // Start a walk with 2 waypoints
      const walk1 = actor.walkPath([
        { x: 100, y: 0, teleport: false },
        { x: 200, y: 0, teleport: false },
      ]);

      // Cancel by starting a new walk (goes to a different destination)
      const walk2 = actor.walkPath([{ x: 500, y: 0, teleport: false }]);

      // Resolve the blocked first move (the cancelled walk should detect generation change)
      resolveFirstMove?.();

      await walk1;
      await walk2;

      // The 1st walk's 2nd waypoint (x: 200) should never have been processed
      const moveToArgs = mockMoveTo.mock.calls.map((call: unknown[]) => call[0]);
      expect(moveToArgs).not.toContainEqual({ x: 200, y: 0 });
    });

    it('restores idle animation after path where all waypoints are within tolerance', async () => {
      const actor = new AgentActor('agent', 'orchestrator', vec(100, 200));
      mockGraphicsUse.mockClear();

      await actor.walkPath([{ x: 100.5, y: 200.5, teleport: false }]);

      // Should still restore to idle after the loop completes
      expect(mockGraphicsUse).toHaveBeenLastCalledWith({ id: 'idle-animation' });
    });

    it('does not trigger extra animation changes during teleport segments', async () => {
      const actor = new AgentActor('agent', 'reviewer', vec(0, 0));
      mockGraphicsUse.mockClear();

      await actor.walkPath([
        { x: 100, y: 0, teleport: false },
        { x: 100, y: 200, teleport: true },
        { x: 300, y: 200, teleport: false },
      ]);

      // graphics.use called exactly twice: walking at start, idle at end
      expect(mockGraphicsUse).toHaveBeenCalledTimes(2);
      expect(mockGraphicsUse).toHaveBeenNthCalledWith(1, { id: 'walking-animation' });
      expect(mockGraphicsUse).toHaveBeenNthCalledWith(2, { id: 'idle-animation' });
    });
  });
});
