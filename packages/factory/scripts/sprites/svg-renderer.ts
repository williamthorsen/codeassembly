/** A 2D pixel grid of palette indices, where 0 is transparent. */
export type PixelGrid = ReadonlyArray<ReadonlyArray<number>>;

/** A body part: a pixel grid with an (x, y) offset into the 32x32 frame. */
export interface BodyPart {
  pixels: PixelGrid;
  offsetX: number;
  offsetY: number;
}

/** An animation frame: an ordered list of body parts composited with the painter's algorithm. */
export type Pose = ReadonlyArray<BodyPart>;

/** Maps palette indices (1-5) to hex color strings; index 0 is transparent. */
export type Palette = readonly [transparent: '', ...colors: string[]];

const SPRITE_SIZE = 32;
const COLS = 4;
const ROWS = 3;

/** Composites body parts onto a size x size grid using the painter's algorithm. */
export function composePose(pose: Pose, size: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      row.push(0);
    }
    grid.push(row);
  }

  for (const part of pose) {
    const { pixels, offsetX, offsetY } = part;
    for (const [py, pixelRow] of pixels.entries()) {
      for (const [px, value] of pixelRow.entries()) {
        if (value === 0) continue;

        const gx = offsetX + px;
        const gy = offsetY + py;

        if (gx < 0 || gx >= size || gy < 0 || gy >= size) continue;

        const gridRow = grid[gy];
        if (gridRow === undefined) continue;
        gridRow[gx] = value;
      }
    }
  }

  return grid;
}

/** Renders exactly 12 poses into a 128x96 SVG sprite sheet with 4 columns and 3 rows. */
export function renderSpriteSheet(poses: Pose[], palette: Palette): string {
  const expectedCount = ROWS * COLS;
  if (poses.length !== expectedCount) {
    throw new Error(`Expected exactly 12 poses but received ${poses.length}`);
  }

  const width = SPRITE_SIZE * COLS;
  const height = SPRITE_SIZE * ROWS;
  const rects: string[] = [];

  for (const [frameIndex, pose] of poses.entries()) {
    const frameX = (frameIndex % COLS) * SPRITE_SIZE;
    const frameY = Math.floor(frameIndex / COLS) * SPRITE_SIZE;
    const grid = composePose(pose, SPRITE_SIZE);

    for (const [y, row] of grid.entries()) {
      for (const [x, paletteIndex] of row.entries()) {
        if (paletteIndex === 0) continue;

        const color = palette[paletteIndex];
        if (color === undefined) {
          console.warn(`Palette index ${paletteIndex} out of range in frame ${frameIndex} at pixel (${x}, ${y})`);
          continue;
        }
        if (color === '') continue;

        rects.push(`<rect x="${frameX + x}" y="${frameY + y}" width="1" height="1" fill="${color}" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join('')}</svg>`;
}
