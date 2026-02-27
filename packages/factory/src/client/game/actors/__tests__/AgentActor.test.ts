import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsUse, mockGetIdleAnimation, mockGetWorkingAnimation } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
    mockGetIdleAnimation: vi.fn(() => ({ id: 'idle-animation' })),
    mockGetWorkingAnimation: vi.fn(() => ({ id: 'working-animation' })),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: mockGraphicsUse };
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
  getWorkingAnimation: mockGetWorkingAnimation,
}));

vi.mock('../../sprites/sprite-definitions.js', () => ({}));

const { AgentActor } = await import('../AgentActor.js');
const { vec } = await import('excalibur');

describe('AgentActor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads idle animation for the given roleType on construction', () => {
    new AgentActor('orchestrator', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('orchestrator');
    expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'idle-animation' });
  });

  it('loads idle animation for analyst roleType', () => {
    new AgentActor('analyst', vec(100, 200));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('analyst');
  });

  it('loads idle animation for planner roleType', () => {
    new AgentActor('planner', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('planner');
  });

  it('loads idle animation for author roleType', () => {
    new AgentActor('author', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('author');
  });

  it('loads idle animation for reviewer roleType', () => {
    new AgentActor('reviewer', vec(0, 0));

    expect(mockGetIdleAnimation).toHaveBeenCalledWith('reviewer');
  });

  it('sets dimensions to 32x32', () => {
    new AgentActor('analyst', vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 32,
        height: 32,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new AgentActor('author', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });

  describe('setAnimationState', () => {
    it('switches to working animation', () => {
      const actor = new AgentActor('orchestrator', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('working');

      expect(mockGetWorkingAnimation).toHaveBeenCalledWith('orchestrator');
      expect(mockGraphicsUse).toHaveBeenCalledWith({ id: 'working-animation' });
    });

    it('switches back to idle animation', () => {
      const actor = new AgentActor('analyst', vec(0, 0));
      actor.setAnimationState('working');
      mockGraphicsUse.mockClear();

      actor.setAnimationState('idle');

      expect(mockGetIdleAnimation).toHaveBeenCalledWith('analyst');
      expect(mockGraphicsUse).toHaveBeenCalled();
    });

    it('does not trigger graphics.use when setting same state', () => {
      const actor = new AgentActor('planner', vec(0, 0));
      mockGraphicsUse.mockClear();

      actor.setAnimationState('idle');

      expect(mockGraphicsUse).not.toHaveBeenCalled();
    });

    it('does not trigger graphics.use when setting working twice', () => {
      const actor = new AgentActor('reviewer', vec(0, 0));
      actor.setAnimationState('working');
      mockGraphicsUse.mockClear();

      actor.setAnimationState('working');

      expect(mockGraphicsUse).not.toHaveBeenCalled();
    });
  });
});
