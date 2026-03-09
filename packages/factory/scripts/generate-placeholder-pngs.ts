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

import { ORCHESTRATOR_POSES } from './sprites/orchestrator-poses.ts';
import { ORCHESTRATOR_PALETTE, SUBAGENT_PALETTE } from './sprites/palettes.ts';
import { SUBAGENT_POSES } from './sprites/subagent-poses.ts';
import { renderSpriteSheet } from './sprites/svg-renderer.ts';

const outDir = join(import.meta.dirname, '../src/client/visualizations/catwalk/sprites/assets');
mkdirSync(outDir, { recursive: true });

// Generate both SVG strings in memory before writing either to disk
const subagentSvg = renderSpriteSheet(SUBAGENT_POSES, SUBAGENT_PALETTE);
const orchestratorSvg = renderSpriteSheet(ORCHESTRATOR_POSES, ORCHESTRATOR_PALETTE);

writeFileSync(join(outDir, 'subagent.svg'), subagentSvg);
writeFileSync(join(outDir, 'orchestrator.svg'), orchestratorSvg);

console.info('Sprite sheets written to', outDir);
