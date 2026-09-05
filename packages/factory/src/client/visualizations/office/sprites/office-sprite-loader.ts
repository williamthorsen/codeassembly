import { ImageFiltering, ImageSource, Sprite, SpriteSheet } from 'excalibur';

import {
  CHARACTER_FRAME_COLS,
  CHARACTER_FRAME_ROWS,
  CHARACTER_SPRITE_H,
  CHARACTER_SPRITE_W,
} from './sprite-definitions.ts';
import {
  CHARACTER_URLS,
  type CharacterName,
  ROOM_SHEET_URLS,
  type RoomSheetKey,
  SINGLE_ASSET_URLS,
  type SingleAssetKey,
} from './sprite-sheet-urls.ts';

// -- Cache --

interface SpriteCache {
  roomSheets: Record<RoomSheetKey, SpriteSheet>;
  roomImageSources: Record<RoomSheetKey, ImageSource>;
  characterSprites: Map<string, Sprite>;
  singleSprites: Map<SingleAssetKey, Sprite>;
}

const spriteState: { sprites: SpriteCache | undefined; inflight: Promise<void> | undefined } = {
  sprites: undefined,
  inflight: undefined,
};

// -- Loader --

/**
 * Load all office sprite sheets and build the sprite cache.
 * The cache is populated synchronously before awaiting image data, so
 * getter functions work immediately after invoking this function.
 * Concurrent callers share the same in-flight promise.
 */
export function loadOfficeSprites(): Promise<void> {
  if (spriteState.sprites !== undefined) return Promise.resolve();
  if (spriteState.inflight !== undefined) return spriteState.inflight;

  const load = releaseInflightAfter(doLoad());
  spriteState.inflight = load;
  return load;
}

/** Awaits a load, releasing the shared in-flight slot once it settles either way. */
async function releaseInflightAfter(load: Promise<void>): Promise<void> {
  try {
    await load;
  } finally {
    spriteState.inflight = undefined;
  }
}

/** Perform the actual sprite loading and cache population. */
async function doLoad(): Promise<void> {
  const imageSources: ImageSource[] = [];

  // Create room/office sheet image sources and sprite sheets
  function buildSheetFromUrl(url: string): { imageSource: ImageSource; spriteSheet: SpriteSheet } {
    const imageSource = new ImageSource(url, { filtering: ImageFiltering.Pixel });
    imageSources.push(imageSource);
    const spriteSheet = SpriteSheet.fromImageSource({
      image: imageSource,
      grid: { rows: 100, columns: 100, spriteWidth: 32, spriteHeight: 32 },
    });
    return { imageSource, spriteSheet };
  }

  const floors = buildSheetFromUrl(ROOM_SHEET_URLS.floors);
  const walls = buildSheetFromUrl(ROOM_SHEET_URLS.walls);
  const shadows = buildSheetFromUrl(ROOM_SHEET_URLS.shadows);
  const office = buildSheetFromUrl(ROOM_SHEET_URLS.office);

  const roomSheets: Record<RoomSheetKey, SpriteSheet> = {
    floors: floors.spriteSheet,
    walls: walls.spriteSheet,
    shadows: shadows.spriteSheet,
    office: office.spriteSheet,
  };

  const roomImageSources: Record<RoomSheetKey, ImageSource> = {
    floors: floors.imageSource,
    walls: walls.imageSource,
    shadows: shadows.imageSource,
    office: office.imageSource,
  };

  // Create character image sources and extract directional sprites
  const characterSprites = new Map<string, Sprite>();

  for (const [name, url] of Object.entries(CHARACTER_URLS)) {
    const imageSource = new ImageSource(url, { filtering: ImageFiltering.Pixel });
    imageSources.push(imageSource);

    const spriteSheet = SpriteSheet.fromImageSource({
      image: imageSource,
      grid: {
        rows: CHARACTER_FRAME_ROWS,
        columns: CHARACTER_FRAME_COLS,
        spriteWidth: CHARACTER_SPRITE_W,
        spriteHeight: CHARACTER_SPRITE_H,
      },
    });

    // Extract one sprite per direction (columns 0-3)
    for (let dir = 0; dir < CHARACTER_FRAME_COLS; dir++) {
      const sprite = spriteSheet.getSprite(dir, 0);
      characterSprites.set(`${name}:${String(dir)}`, sprite);
    }
  }

  // Create furniture single image sources and sprites
  const singleSprites = new Map<SingleAssetKey, Sprite>();
  const singleKeys: readonly SingleAssetKey[] = [
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
  ];

  for (const key of singleKeys) {
    const url = SINGLE_ASSET_URLS[key];
    const imageSource = new ImageSource(url, { filtering: ImageFiltering.Pixel });
    imageSources.push(imageSource);
    singleSprites.set(key, Sprite.from(imageSource));
  }

  // Populate the cache synchronously so getters work immediately.
  spriteState.sprites = {
    roomSheets,
    roomImageSources,
    characterSprites,
    singleSprites,
  };

  try {
    await Promise.all(imageSources.map((source) => source.load()));
  } catch (error: unknown) {
    spriteState.sprites = undefined;
    throw error;
  }
}

// region | Getters

/** Return the floor tile sprite sheet. Throws if sprites have not been loaded. */
export function getFloorSheet(): SpriteSheet {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomSheets.floors;
}

/** Return the wall tile sprite sheet. Throws if sprites have not been loaded. */
export function getWallSheet(): SpriteSheet {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomSheets.walls;
}

/** Return the floor shadow sprite sheet. Throws if sprites have not been loaded. */
export function getShadowSheet(): SpriteSheet {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomSheets.shadows;
}

/** Return the office furniture sprite sheet. Throws if sprites have not been loaded. */
export function getOfficeSheet(): SpriteSheet {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomSheets.office;
}

/** Return a character sprite for the given name and direction (0-3). */
export function getCharacterSprite(name: CharacterName, direction: number): Sprite {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }

  const key = `${name}:${String(direction)}`;
  const sprite = spriteState.sprites.characterSprites.get(key);
  if (sprite === undefined) {
    throw new Error(`No character sprite found for "${name}" direction ${String(direction)}.`);
  }
  return sprite;
}

/** Return the standalone sprite for a furniture single asset. */
export function getSingleSprite(key: SingleAssetKey): Sprite {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }

  const sprite = spriteState.sprites.singleSprites.get(key);
  if (sprite === undefined) {
    throw new Error(`No single sprite found for key "${key}".`);
  }
  return sprite;
}

/** Return the raw ImageSource for the floor sheet (needed for Canvas-based tile drawing). */
export function getFloorImageSource(): ImageSource {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomImageSources.floors;
}

/** Return the raw ImageSource for the wall sheet (needed for Canvas-based tile drawing). */
export function getWallImageSource(): ImageSource {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomImageSources.walls;
}

/** Return the raw ImageSource for the shadow sheet (needed for Canvas-based tile drawing). */
export function getShadowImageSource(): ImageSource {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomImageSources.shadows;
}

/** Return the raw ImageSource for the office furniture sheet (needed for Canvas-based region drawing). */
export function getOfficeImageSource(): ImageSource {
  if (spriteState.sprites === undefined) {
    throw new Error('Office sprites have not been loaded. Call loadOfficeSprites() first.');
  }
  return spriteState.sprites.roomImageSources.office;
}

/** Clear the office sprite cache, allowing sprites to be reloaded. Useful for tests. */
export function clearOfficeSpriteCache(): void {
  spriteState.sprites = undefined;
}

// endregion | Getters
