import { describe, expect, it } from 'vitest';

import { ORCHESTRATOR_POSES } from '../orchestrator-poses.ts';
import { ORCHESTRATOR_PALETTE, SUBAGENT_PALETTE } from '../palettes.ts';
import { SUBAGENT_POSES } from '../subagent-poses.ts';
import { type BodyPart, composePose, type Palette, type Pose, renderSpriteSheet } from '../svg-renderer.ts';

// ── composePose ─────────────────────────────────────────────────────────────

describe('composePose', () => {
  it('places a single body part at a known offset', () => {
    const part: BodyPart = {
      pixels: [
        [1, 2],
        [3, 0],
      ],
      offsetX: 5,
      offsetY: 10,
    };
    const grid = composePose([part], 32);

    expect(grid[10]?.[5]).toBe(1);
    expect(grid[10]?.[6]).toBe(2);
    expect(grid[11]?.[5]).toBe(3);
    // Pixel value 0 leaves the grid at 0 (transparent)
    expect(grid[11]?.[6]).toBe(0);
  });

  it('silently clips pixels that extend beyond the grid boundary', () => {
    const part: BodyPart = {
      pixels: [[1, 2, 3]],
      offsetX: 30,
      offsetY: 0,
    };
    const grid = composePose([part], 32);

    // Only the first two pixels fit (indices 30 and 31)
    expect(grid[0]?.[30]).toBe(1);
    expect(grid[0]?.[31]).toBe(2);
    // Index 32 is out of bounds -- the grid only has 32 columns (0-31)
    expect(grid[0]?.length).toBe(32);
  });

  it('clips pixels with negative offsets', () => {
    const part: BodyPart = {
      pixels: [[1, 2, 3]],
      offsetX: -1,
      offsetY: 0,
    };
    const grid = composePose([part], 32);

    // offsetX=-1: pixel at px=0 maps to gx=-1 (clipped), px=1 maps to gx=0, px=2 maps to gx=1
    expect(grid[0]?.[0]).toBe(2);
    expect(grid[0]?.[1]).toBe(3);
  });

  it('applies painter algorithm: later body parts overwrite earlier ones', () => {
    const bottom: BodyPart = {
      pixels: [[1]],
      offsetX: 5,
      offsetY: 5,
    };
    const top: BodyPart = {
      pixels: [[2]],
      offsetX: 5,
      offsetY: 5,
    };
    const grid = composePose([bottom, top], 32);

    // The second (top) body part should win
    expect(grid[5]?.[5]).toBe(2);
  });

  it('transparent pixels (value 0) do not overwrite previously placed pixels', () => {
    const bottom: BodyPart = {
      pixels: [[3]],
      offsetX: 5,
      offsetY: 5,
    };
    const top: BodyPart = {
      pixels: [[0]],
      offsetX: 5,
      offsetY: 5,
    };
    const grid = composePose([bottom, top], 32);

    // The top part has 0 (transparent), so the bottom part's value should remain
    expect(grid[5]?.[5]).toBe(3);
  });

  it('returns a grid of the requested size initialized to zeros', () => {
    const grid = composePose([], 16);

    expect(grid).toHaveLength(16);
    for (const row of grid) {
      expect(row).toHaveLength(16);
      for (const cell of row) {
        expect(cell).toBe(0);
      }
    }
  });
});

// ── renderSpriteSheet ───────────────────────────────────────────────────────

describe('renderSpriteSheet', () => {
  const palette: Palette = ['', '#111', '#222', '#333', '#444', '#555'];

  it('produces an SVG with correct 128x96 dimensions', () => {
    const poses: Pose[] = Array.from({ length: 12 }, () => []);
    const svg = renderSpriteSheet(poses, palette);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="96"');
  });

  it('starts and ends with proper SVG tags', () => {
    const poses: Pose[] = Array.from({ length: 12 }, () => []);
    const svg = renderSpriteSheet(poses, palette);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('renders empty poses as an SVG with no rect elements', () => {
    const poses: Pose[] = Array.from({ length: 12 }, () => []);
    const svg = renderSpriteSheet(poses, palette);

    expect(svg).not.toContain('<rect');
  });

  it('places frame 0 pixels at the correct offset (0, 0)', () => {
    const part: BodyPart = { pixels: [[1]], offsetX: 3, offsetY: 7 };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 0 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    // Frame 0: col=0, row=0 -> frameX=0, frameY=0
    // Pixel at grid position (3, 7) -> SVG x=0+3=3, y=0+7=7
    expect(svg).toContain('x="3" y="7" width="1" height="1" fill="#111"');
  });

  it('places frame 1 pixels at column offset (32, 0)', () => {
    const part: BodyPart = { pixels: [[2]], offsetX: 0, offsetY: 0 };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 1 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    // Frame 1: col=1, row=0 -> frameX=32, frameY=0
    expect(svg).toContain('x="32" y="0" width="1" height="1" fill="#222"');
  });

  it('places frame 4 pixels at row offset (0, 32)', () => {
    const part: BodyPart = { pixels: [[3]], offsetX: 0, offsetY: 0 };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 4 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    // Frame 4: col=0, row=1 -> frameX=0, frameY=32
    expect(svg).toContain('x="0" y="32" width="1" height="1" fill="#333"');
  });

  it('places frame 5 pixels at offset (32, 32)', () => {
    const part: BodyPart = { pixels: [[4]], offsetX: 1, offsetY: 2 };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 5 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    // Frame 5: col=1, row=1 -> frameX=32, frameY=32
    // Pixel at (1,2) -> SVG x=32+1=33, y=32+2=34
    expect(svg).toContain('x="33" y="34" width="1" height="1" fill="#444"');
  });

  it('skips transparent pixels (palette index 0)', () => {
    const part: BodyPart = {
      pixels: [[0, 1]],
      offsetX: 0,
      offsetY: 0,
    };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 0 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    // Only one rect for palette index 1, none for palette index 0
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(1);
    expect(svg).toContain('x="1" y="0"');
    expect(svg).not.toContain('x="0" y="0"');
  });

  it('maps palette indices to the correct hex colors', () => {
    const part: BodyPart = {
      pixels: [[1, 2, 3, 4, 5]],
      offsetX: 0,
      offsetY: 0,
    };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 0 ? [part] : []));
    const svg = renderSpriteSheet(poses, palette);

    expect(svg).toContain('fill="#111"');
    expect(svg).toContain('fill="#222"');
    expect(svg).toContain('fill="#333"');
    expect(svg).toContain('fill="#444"');
    expect(svg).toContain('fill="#555"');
  });

  it('throws when pose count does not equal 12', () => {
    const tooPoses: Pose[] = Array.from({ length: 10 }, () => []);

    expect(() => renderSpriteSheet(tooPoses, palette)).toThrow(/expected exactly 12 poses/i);
  });

  it('warns when a pixel references an out-of-range palette index', () => {
    const part: BodyPart = {
      pixels: [[6]], // palette only has indices 0-5
      offsetX: 0,
      offsetY: 0,
    };
    const poses: Pose[] = Array.from({ length: 12 }, (_, i) => (i === 0 ? [part] : []));

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      const svg = renderSpriteSheet(poses, palette);
      // The pixel should be skipped (no rect emitted)
      expect(svg).not.toContain('<rect');
      // A warning should have been emitted
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/palette/i);
    } finally {
      console.warn = originalWarn;
    }
  });
});

// ── Pose data integrity ─────────────────────────────────────────────────────

describe('pose data integrity', () => {
  it('SUBAGENT_POSES has exactly 12 poses', () => {
    expect(SUBAGENT_POSES).toHaveLength(12);
  });

  it('ORCHESTRATOR_POSES has exactly 12 poses', () => {
    expect(ORCHESTRATOR_POSES).toHaveLength(12);
  });

  it('every subagent pose has at least one body part', () => {
    for (const [i, pose] of SUBAGENT_POSES.entries()) {
      expect(pose.length, `pose ${i} has no body parts`).toBeGreaterThan(0);
    }
  });

  it('every orchestrator pose has at least one body part', () => {
    for (const [i, pose] of ORCHESTRATOR_POSES.entries()) {
      expect(pose.length, `pose ${i} has no body parts`).toBeGreaterThan(0);
    }
  });

  it('all subagent pixel values are within the valid palette range [0, 5]', () => {
    for (const [poseIndex, pose] of SUBAGENT_POSES.entries()) {
      for (const [partIndex, part] of pose.entries()) {
        for (const [rowIndex, row] of part.pixels.entries()) {
          for (const [colIndex, value] of row.entries()) {
            expect(
              value,
              `subagent pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              value,
              `subagent pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });

  it('all orchestrator pixel values are within the valid palette range [0, 6]', () => {
    for (const [poseIndex, pose] of ORCHESTRATOR_POSES.entries()) {
      for (const [partIndex, part] of pose.entries()) {
        for (const [rowIndex, row] of part.pixels.entries()) {
          for (const [colIndex, value] of row.entries()) {
            expect(
              value,
              `orchestrator pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              value,
              `orchestrator pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeLessThanOrEqual(6);
          }
        }
      }
    }
  });

  it('subagent poses produce valid SVG output', () => {
    const svg = renderSpriteSheet(SUBAGENT_POSES, SUBAGENT_PALETTE);

    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="96"');
    expect(svg).toContain('<rect');
  });

  it('orchestrator poses produce valid SVG output', () => {
    const svg = renderSpriteSheet(ORCHESTRATOR_POSES, ORCHESTRATOR_PALETTE);

    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="96"');
    expect(svg).toContain('<rect');
  });
});
