import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFromSvgString, mockFromImageSource, mockFromSpriteSheetCoordinates, mockLoad } = vi.hoisted(() => {
  const mockLoad = vi.fn(() => Promise.resolve());
  const mockAnimation = { type: 'animation' };
  return {
    mockLoad,
    mockFromSvgString: vi.fn(() => ({ type: 'imageSource', load: mockLoad })),
    mockFromImageSource: vi.fn(() => ({ type: 'spriteSheet' })),
    mockFromSpriteSheetCoordinates: vi.fn(() => ({ ...mockAnimation })),
  };
});

vi.mock('excalibur', () => ({
  Animation: {
    fromSpriteSheetCoordinates: mockFromSpriteSheetCoordinates,
  },
  AnimationStrategy: {
    End: 'end',
    Loop: 'loop',
    PingPong: 'pingpong',
    Freeze: 'freeze',
  },
  ImageFiltering: {
    Pixel: 'Pixel',
    Blended: 'Blended',
  },
  ImageSource: {
    fromSvgString: mockFromSvgString,
  },
  SpriteSheet: {
    fromImageSource: mockFromImageSource,
  },
}));

const {
  clearSpriteCache,
  getCelebratingAnimation,
  getConcernedAnimation,
  getIdleAnimation,
  getRestingAnimation,
  getWalkingAnimation,
  getWorkingAnimation,
  loadAllSprites,
} = await import('../agent-sprite-loader.js');

const {
  CELEBRATING_DURATION,
  CELEBRATING_FRAME_COORDINATES,
  CELEBRATING_STRATEGY,
  CONCERNED_DURATION,
  CONCERNED_FRAME_COORDINATES,
  CONCERNED_STRATEGY,
  IDLE_DURATION,
  IDLE_FRAME_COORDINATES,
  IDLE_STRATEGY,
  RESTING_DURATION,
  RESTING_FRAME_COORDINATES,
  RESTING_STRATEGY,
  WALKING_DURATION,
  WALKING_FRAME_COORDINATES,
  WALKING_STRATEGY,
  WORKING_DURATION,
  WORKING_FRAME_COORDINATES,
  WORKING_STRATEGY,
} = await import('../sprite-definitions.js');

describe('agent-sprite-loader', () => {
  afterEach(() => {
    clearSpriteCache();
    vi.clearAllMocks();
  });

  describe('getIdleAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getIdleAnimation('orchestrator');
      const second = getIdleAnimation('orchestrator');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('returns different animations for different roleTypes', () => {
      // Each call creates a new object via the spread in the mock
      const orchestrator = getIdleAnimation('orchestrator');
      const analyst = getIdleAnimation('analyst');

      expect(orchestrator).not.toBe(analyst);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(2);
    });

    it('passes correct parameters to SpriteSheet.fromImageSource', () => {
      getIdleAnimation('planner');

      expect(mockFromImageSource).toHaveBeenCalledWith({
        image: expect.objectContaining({ type: 'imageSource' }),
        grid: {
          rows: 3,
          columns: 4,
          spriteWidth: 32,
          spriteHeight: 32,
        },
      });
    });

    it('passes correct animation parameters for idle', () => {
      getIdleAnimation('orchestrator');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: IDLE_FRAME_COORDINATES,
        durationPerFrame: IDLE_DURATION,
        strategy: IDLE_STRATEGY,
      });
    });
  });

  describe('getWalkingAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getWalkingAnimation('planner');
      const second = getWalkingAnimation('planner');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('passes correct animation parameters for walking', () => {
      getWalkingAnimation('analyst');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: WALKING_FRAME_COORDINATES,
        durationPerFrame: WALKING_DURATION,
        strategy: WALKING_STRATEGY,
      });
    });
  });

  describe('getWorkingAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getWorkingAnimation('author');
      const second = getWorkingAnimation('author');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('passes correct animation parameters for working', () => {
      getWorkingAnimation('reviewer');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: WORKING_FRAME_COORDINATES,
        durationPerFrame: WORKING_DURATION,
        strategy: WORKING_STRATEGY,
      });
    });
  });

  describe('getCelebratingAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getCelebratingAnimation('orchestrator');
      const second = getCelebratingAnimation('orchestrator');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('passes correct animation parameters for celebrating', () => {
      getCelebratingAnimation('planner');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: CELEBRATING_FRAME_COORDINATES,
        durationPerFrame: CELEBRATING_DURATION,
        strategy: CELEBRATING_STRATEGY,
      });
    });
  });

  describe('getConcernedAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getConcernedAnimation('reviewer');
      const second = getConcernedAnimation('reviewer');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('passes correct animation parameters for concerned', () => {
      getConcernedAnimation('author');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: CONCERNED_FRAME_COORDINATES,
        durationPerFrame: CONCERNED_DURATION,
        strategy: CONCERNED_STRATEGY,
      });
    });
  });

  describe('getRestingAnimation', () => {
    it('returns a cached animation on repeated calls for the same roleType', () => {
      const first = getRestingAnimation('orchestrator');
      const second = getRestingAnimation('orchestrator');

      expect(first).toBe(second);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(1);
    });

    it('passes correct animation parameters for resting', () => {
      getRestingAnimation('planner');

      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledWith({
        spriteSheet: expect.objectContaining({ type: 'spriteSheet' }),
        frameCoordinates: RESTING_FRAME_COORDINATES,
        durationPerFrame: RESTING_DURATION,
        strategy: RESTING_STRATEGY,
      });
    });
  });

  describe('sprite sheet caching', () => {
    it('creates only one ImageSource per roleType when all animations are requested', () => {
      getIdleAnimation('orchestrator');
      getWalkingAnimation('orchestrator');
      getWorkingAnimation('orchestrator');
      getCelebratingAnimation('orchestrator');
      getConcernedAnimation('orchestrator');
      getRestingAnimation('orchestrator');

      expect(mockFromSvgString).toHaveBeenCalledTimes(1);
    });

    it('creates separate ImageSources for different roleTypes', () => {
      getIdleAnimation('orchestrator');
      getIdleAnimation('analyst');

      expect(mockFromSvgString).toHaveBeenCalledTimes(2);
    });

    it('creates only one SpriteSheet per roleType when all animations are requested', () => {
      getIdleAnimation('planner');
      getWalkingAnimation('planner');
      getWorkingAnimation('planner');
      getCelebratingAnimation('planner');
      getConcernedAnimation('planner');
      getRestingAnimation('planner');

      expect(mockFromImageSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearSpriteCache', () => {
    it('forces new animation creation after clearing', () => {
      const before = getIdleAnimation('reviewer');
      clearSpriteCache();
      const after = getIdleAnimation('reviewer');

      expect(before).not.toBe(after);
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(2);
    });

    it('forces new sprite sheet creation after clearing', () => {
      getIdleAnimation('orchestrator');
      clearSpriteCache();
      getIdleAnimation('orchestrator');

      expect(mockFromSvgString).toHaveBeenCalledTimes(2);
    });

    it('clears caches for all animation types', () => {
      getIdleAnimation('analyst');
      getWalkingAnimation('analyst');
      getWorkingAnimation('analyst');
      getCelebratingAnimation('analyst');
      getConcernedAnimation('analyst');
      getRestingAnimation('analyst');
      clearSpriteCache();

      getIdleAnimation('analyst');
      getWalkingAnimation('analyst');
      getWorkingAnimation('analyst');
      getCelebratingAnimation('analyst');
      getConcernedAnimation('analyst');
      getRestingAnimation('analyst');

      // 6 before clear + 6 after clear = 12
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(12);
    });
  });

  describe('loadAllSprites', () => {
    it('preloads animations for all 5 roleTypes', async () => {
      await loadAllSprites();

      // 6 calls per roleType (idle + walking + working + celebrating + concerned + resting) x 5 roleTypes = 30
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(30);
    });

    it('calls load() on all image sources', async () => {
      await loadAllSprites();

      // 5 roleTypes = 5 ImageSources, each loaded once
      expect(mockLoad).toHaveBeenCalledTimes(5);
    });
  });
});
