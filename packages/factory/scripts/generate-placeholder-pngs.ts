/**
 * Generate placeholder sprite sheet SVGs for the catwalk visualization.
 *
 * Produces simple colored-rectangle placeholders (orchestrator + subagent) and writes
 * them to `src/client/visualizations/catwalk/sprites/assets/`. These are the sprites
 * actually loaded by the catwalk renderer at runtime.
 *
 * Run with: `node --import tsx packages/factory/scripts/generate-placeholder-pngs.ts`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SPRITE_SIZE = 32;
const COLS = 4;
const ROWS = 3;
const WIDTH = SPRITE_SIZE * COLS;
const HEIGHT = SPRITE_SIZE * ROWS;

function generatePlaceholderSvg(color: string, label: string): string {
  const frames: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * SPRITE_SIZE;
      const y = row * SPRITE_SIZE;
      const frameNum = row * COLS + col;
      frames.push(
        `<rect x="${x + 2}" y="${y + 2}" width="${SPRITE_SIZE - 4}" height="${SPRITE_SIZE - 4}" rx="4" fill="${color}" />`,
        `<text x="${x + SPRITE_SIZE / 2}" y="${y + SPRITE_SIZE / 2 + 3}" text-anchor="middle" font-size="8" font-family="monospace" fill="white">${label}${frameNum}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${frames.join('')}</svg>`;
}

const outDir = join(import.meta.dirname, '../src/client/visualizations/catwalk/sprites/assets');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'subagent.svg'), generatePlaceholderSvg('#888899', 'S'));
writeFileSync(join(outDir, 'orchestrator.svg'), generatePlaceholderSvg('#CCAA44', 'O'));

console.info('Placeholder sprite sheets written to', outDir);
