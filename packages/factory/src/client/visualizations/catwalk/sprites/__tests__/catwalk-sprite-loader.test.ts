import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockImageSourceConstructor, mockImageSourceLoad, mockSpriteSheetFromImageSource, mockAnimationFromCoords } =
  vi.hoisted(() => {
    const mockLoad = vi.fn().mockResolvedValue(undefined);
    return {
      mockImageSourceConstructor: vi.fn(),
      mockImageSourceLoad: mockLoad,
      mockSpriteSheetFromImageSource: vi.fn(),
      mockAnimationFromCoords: vi.fn(),
    };
  });

vi.mock('excalibur', () => {
  class MockImageSource {
    url: string;
    options: Record<string, unknown>;
    load = mockImageSourceLoad;

    constructor(url: string, options: Record<string, unknown>) {
      mockImageSourceConstructor(url, options);
      this.url = url;
      this.options = options;
    }
  }

  const MockSpriteSheet = {
    fromImageSource: mockSpriteSheetFromImageSource,
  };

  class MockAnimation {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
    static fromSpriteSheetCoordinates = mockAnimationFromCoords;
  }

  return {
    ImageSource: MockImageSource,
    ImageFiltering: { Pixel: 'pixel' },
    SpriteSheet: MockSpriteSheet,
    Animation: MockAnimation,
    AnimationStrategy: {
      PingPong: 'ping-pong',
      Loop: 'loop',
      Freeze: 'freeze',
    },
  };
});

const { loadAllCatwalkSprites, getAnimation, clearCatwalkSpriteCache } = await import('../catwalk-sprite-loader.js');
const { SPRITE_SHEET_URLS } = await import('../sprite-sheet-urls.js');

describe('catwalk-sprite-loader', () => {
  beforeEach(() => {
    clearCatwalkSpriteCache();
    vi.clearAllMocks();

    mockSpriteSheetFromImageSource.mockReturnValue({ type: 'sprite-sheet' });
    mockAnimationFromCoords.mockImplementation((config: Record<string, unknown>) => ({
      type: 'animation',
      config,
    }));
  });

  afterEach(() => {
    clearCatwalkSpriteCache();
  });

  describe('loadAllCatwalkSprites', () => {
    it('loads 2 image sources (subagent + orchestrator)', async () => {
      await loadAllCatwalkSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(2);
      expect(mockImageSourceLoad).toHaveBeenCalledTimes(2);
    });

    it('passes the correct URL for each sprite type', async () => {
      await loadAllCatwalkSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledWith(SPRITE_SHEET_URLS.subagent, expect.anything());
      expect(mockImageSourceConstructor).toHaveBeenCalledWith(SPRITE_SHEET_URLS.orchestrator, expect.anything());
    });

    it('is idempotent (second call is a no-op)', async () => {
      await loadAllCatwalkSprites();
      await loadAllCatwalkSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(2);
      expect(mockImageSourceLoad).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent calls (cache populated synchronously)', async () => {
      const first = loadAllCatwalkSprites();
      const second = loadAllCatwalkSprites();

      await Promise.all([first, second]);

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(2);
      expect(mockImageSourceLoad).toHaveBeenCalledTimes(2);
    });

    it('creates sprite sheets from loaded image sources', async () => {
      await loadAllCatwalkSprites();

      expect(mockSpriteSheetFromImageSource).toHaveBeenCalledTimes(2);
    });

    it('creates animations for all 6 states x 2 sprite types = 12 animations', async () => {
      await loadAllCatwalkSprites();

      expect(mockAnimationFromCoords).toHaveBeenCalledTimes(12);
    });

    it('resets cache on load failure so subsequent calls can retry', async () => {
      mockImageSourceLoad.mockRejectedValueOnce(new Error('network error'));

      await expect(loadAllCatwalkSprites()).rejects.toThrow('network error');
      expect(() => getAnimation('subagent', 'idle')).toThrow('Catwalk sprites have not been loaded');

      // Retry succeeds
      mockImageSourceLoad.mockResolvedValue(undefined);
      await loadAllCatwalkSprites();

      expect(getAnimation('subagent', 'idle')).toBeDefined();
      // 2 calls for the failed attempt + 2 for the retry = 4 ImageSource constructions
      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(4);
    });
  });

  describe('getAnimation', () => {
    it('throws if called before loading', () => {
      expect(() => getAnimation('subagent', 'idle')).toThrow('Catwalk sprites have not been loaded');
    });

    it('works synchronously after calling loadAllCatwalkSprites (before await)', () => {
      // The cache is populated synchronously, so getAnimation is safe to call
      // immediately without awaiting the load promise
      loadAllCatwalkSprites().catch(() => undefined);

      expect(() => getAnimation('subagent', 'idle')).not.toThrow();
      expect(getAnimation('subagent', 'idle')).toBeDefined();
    });

    it('returns an animation for each sprite type and state', async () => {
      await loadAllCatwalkSprites();

      const spriteTypes = ['subagent', 'orchestrator'] as const;
      const states = ['idle', 'walking', 'working', 'celebrating', 'concerned', 'resting'] as const;

      for (const spriteType of spriteTypes) {
        for (const state of states) {
          const animation = getAnimation(spriteType, state);
          expect(animation).toBeDefined();
          expect(animation).toEqual(expect.objectContaining({ type: 'animation' }));
        }
      }
    });

    it('returns cached instances on repeat calls', async () => {
      await loadAllCatwalkSprites();

      const first = getAnimation('subagent', 'idle');
      const second = getAnimation('subagent', 'idle');

      expect(first).toBe(second);
    });
  });

  describe('clearCatwalkSpriteCache', () => {
    it('allows sprites to be reloaded after clearing', async () => {
      await loadAllCatwalkSprites();
      clearCatwalkSpriteCache();
      await loadAllCatwalkSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(4);
    });
  });
});
