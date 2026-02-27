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

const { clearSpriteCache, getIdleAnimation, getWorkingAnimation, loadAllSprites } =
  await import('../agent-sprite-loader.js');

const {
  IDLE_FRAME_COORDINATES,
  IDLE_DURATION,
  IDLE_STRATEGY,
  WORKING_FRAME_COORDINATES,
  WORKING_DURATION,
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
          rows: 2,
          columns: 3,
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

  describe('sprite sheet caching', () => {
    it('creates only one ImageSource per roleType when both animations are requested', () => {
      getIdleAnimation('orchestrator');
      getWorkingAnimation('orchestrator');

      expect(mockFromSvgString).toHaveBeenCalledTimes(1);
    });

    it('creates separate ImageSources for different roleTypes', () => {
      getIdleAnimation('orchestrator');
      getIdleAnimation('analyst');

      expect(mockFromSvgString).toHaveBeenCalledTimes(2);
    });

    it('creates only one SpriteSheet per roleType when both animations are requested', () => {
      getIdleAnimation('planner');
      getWorkingAnimation('planner');

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
  });

  describe('loadAllSprites', () => {
    it('preloads animations for all 5 roleTypes', async () => {
      await loadAllSprites();

      // 2 calls per roleType (idle + working) x 5 roleTypes = 10
      expect(mockFromSpriteSheetCoordinates).toHaveBeenCalledTimes(10);
    });

    it('calls load() on all image sources', async () => {
      await loadAllSprites();

      // 5 roleTypes = 5 ImageSources, each loaded once
      expect(mockLoad).toHaveBeenCalledTimes(5);
    });
  });
});
