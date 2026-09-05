import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockImageSourceConstructor, mockImageSourceLoad, mockSpriteSheetFromImageSource, mockSpriteFrom } = vi.hoisted(
  () => {
    const mockLoad = vi.fn().mockResolvedValue(undefined);
    return {
      mockImageSourceConstructor: vi.fn(),
      mockImageSourceLoad: mockLoad,
      mockSpriteSheetFromImageSource: vi.fn(),
      mockSpriteFrom: vi.fn(),
    };
  },
);

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

  const MockSprite = {
    from(_imageSource: unknown) {
      mockSpriteFrom(_imageSource);
      return { type: 'sprite' };
    },
  };

  return {
    ImageSource: MockImageSource,
    ImageFiltering: { Pixel: 'pixel' },
    SpriteSheet: MockSpriteSheet,
    Sprite: MockSprite,
  };
});

const {
  loadOfficeSprites,
  clearOfficeSpriteCache,
  getFloorSheet,
  getWallSheet,
  getShadowSheet,
  getOfficeSheet,
  getCharacterSprite,
  getSingleSprite,
  getFloorImageSource,
  getWallImageSource,
  getShadowImageSource,
  getOfficeImageSource,
} = await import('../office-sprite-loader.ts');
const { ROOM_SHEET_URLS, CHARACTER_URLS, SINGLE_ASSET_URLS } = await import('../sprite-sheet-urls.ts');

describe('office-sprite-loader', () => {
  beforeEach(() => {
    clearOfficeSpriteCache();
    vi.clearAllMocks();

    mockSpriteSheetFromImageSource.mockReturnValue({
      type: 'sprite-sheet',
      getSprite: vi.fn().mockReturnValue({ type: 'sprite' }),
    });
  });

  afterEach(() => {
    clearOfficeSpriteCache();
  });

  describe(loadOfficeSprites, () => {
    it('creates 23 ImageSource instances (4 room + 7 character + 12 singles)', async () => {
      await loadOfficeSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(23);
    });

    it('loads all 23 image sources', async () => {
      await loadOfficeSprites();

      expect(mockImageSourceLoad).toHaveBeenCalledTimes(23);
    });

    it('passes the correct URL for each room sheet', async () => {
      await loadOfficeSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledWith(ROOM_SHEET_URLS.floors, expect.anything());
      expect(mockImageSourceConstructor).toHaveBeenCalledWith(ROOM_SHEET_URLS.walls, expect.anything());
      expect(mockImageSourceConstructor).toHaveBeenCalledWith(ROOM_SHEET_URLS.shadows, expect.anything());
      expect(mockImageSourceConstructor).toHaveBeenCalledWith(ROOM_SHEET_URLS.office, expect.anything());
    });

    it('passes the correct URL for each character', async () => {
      await loadOfficeSprites();

      for (const url of Object.values(CHARACTER_URLS)) {
        expect(mockImageSourceConstructor).toHaveBeenCalledWith(url, expect.anything());
      }
    });

    it('passes the correct URL for each single asset', async () => {
      await loadOfficeSprites();

      for (const url of Object.values(SINGLE_ASSET_URLS)) {
        expect(mockImageSourceConstructor).toHaveBeenCalledWith(url, expect.anything());
      }
    });

    it('is idempotent (second call is a no-op)', async () => {
      await loadOfficeSprites();
      await loadOfficeSprites();

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(23);
      expect(mockImageSourceLoad).toHaveBeenCalledTimes(23);
    });

    it('deduplicates concurrent calls via shared in-flight promise', async () => {
      const first = loadOfficeSprites();
      const second = loadOfficeSprites();

      await Promise.all([first, second]);

      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(23);
      expect(mockImageSourceLoad).toHaveBeenCalledTimes(23);
    });

    it('resets cache on load failure so subsequent calls can retry', async () => {
      mockImageSourceLoad.mockRejectedValueOnce(new Error('network error'));

      await expect(loadOfficeSprites()).rejects.toThrow('network error');
      expect(() => getFloorSheet()).toThrow('Office sprites have not been loaded');

      // Retry succeeds
      mockImageSourceLoad.mockResolvedValue(undefined);
      await loadOfficeSprites();

      expect(getFloorSheet()).toBeDefined();
      // 23 for failed attempt + 23 for retry = 46
      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(46);
    });

    it('creates 11 sprite sheets (4 room + 7 character)', async () => {
      await loadOfficeSprites();

      expect(mockSpriteSheetFromImageSource).toHaveBeenCalledTimes(11);
    });

    it('creates 12 single sprites via Sprite.from', async () => {
      await loadOfficeSprites();

      expect(mockSpriteFrom).toHaveBeenCalledTimes(12);
    });
  });

  describe('getters before loading', () => {
    it.each([
      ['getFloorSheet', () => getFloorSheet()],
      ['getWallSheet', () => getWallSheet()],
      ['getShadowSheet', () => getShadowSheet()],
      ['getOfficeSheet', () => getOfficeSheet()],
      ['getFloorImageSource', () => getFloorImageSource()],
      ['getWallImageSource', () => getWallImageSource()],
      ['getShadowImageSource', () => getShadowImageSource()],
      ['getOfficeImageSource', () => getOfficeImageSource()],
      ['getCharacterSprite', () => getCharacterSprite('Adam', 0)],
      ['getSingleSprite', () => getSingleSprite('plant100')],
    ])('%s throws before loading', (_name, fn) => {
      expect(fn).toThrow('Office sprites have not been loaded');
    });
  });

  describe('getters after loading', () => {
    beforeEach(async () => {
      await loadOfficeSprites();
    });

    it('returns room sheet sprite sheets', () => {
      expect(getFloorSheet()).toBeDefined();
      expect(getWallSheet()).toBeDefined();
      expect(getShadowSheet()).toBeDefined();
      expect(getOfficeSheet()).toBeDefined();
    });

    it('returns room image sources', () => {
      expect(getFloorImageSource()).toBeDefined();
      expect(getWallImageSource()).toBeDefined();
      expect(getShadowImageSource()).toBeDefined();
      expect(getOfficeImageSource()).toBeDefined();
    });

    it('returns character sprites for all names and directions', () => {
      const names = ['Adam', 'Alex', 'Amelia', 'Ash', 'Bob', 'Dan', 'Rob'] as const;
      for (const name of names) {
        for (let dir = 0; dir < 4; dir++) {
          expect(getCharacterSprite(name, dir)).toBeDefined();
        }
      }
    });

    it('returns single sprites for all asset keys', () => {
      const keys = [
        'analysisBoard172',
        'certificate113',
        'certificate114',
        'chartBoard171',
        'dashboard175',
        'deskLamp141',
        'diploma116',
        'execShelf206',
        'modernShelf205',
        'plant100',
        'prepDesk186',
        'workshopDesk183',
      ] as const;
      for (const key of keys) {
        expect(getSingleSprite(key)).toBeDefined();
      }
    });

    it('returns cached instances on repeat calls', () => {
      const first = getFloorSheet();
      const second = getFloorSheet();
      expect(first).toBe(second);
    });
  });

  describe(clearOfficeSpriteCache, () => {
    it('allows sprites to be reloaded after clearing', async () => {
      await loadOfficeSprites();
      clearOfficeSpriteCache();
      await loadOfficeSprites();

      // 23 + 23 = 46
      expect(mockImageSourceConstructor).toHaveBeenCalledTimes(46);
    });
  });
});
