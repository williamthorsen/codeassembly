import { MAX_AMBIENT_LINES, PREAMBLE_WIDTH } from './card-limits.ts';
import type { AmbientDescription } from './describe-config.ts';
import { COMPOUND_PADDING_LEFT, COMPOUND_PADDING_RIGHT, countWrappedLines } from './layout-metrics.ts';

// -- Text metrics of a preamble; they match the preamble's styles in `canvas.css` --
// The prompt's serif face at the preamble's 14px; wider than its true average, so that a line never overflows.
const PROMPT_CHARACTER_WIDTH = 7.2;
const PREAMBLE_LINE_HEIGHT = 20;
const PREAMBLE_HEADING_HEIGHT = 16;
const PREAMBLE_ENTRY_GAP = 4;
const PREAMBLE_GAP_BELOW = 8;

/** The gap between two columns of a preamble. */
export const PREAMBLE_COLUMN_GAP = 32;

/** The columns of a preamble, filled down each column and then across, and the height of the tallest. */
export interface PreambleColumns {
  columns: number;
  columnHeight: number;
}

/** The parts of an ambient instruction that its height depends on. */
type AmbientEntry = Pick<AmbientDescription, 'text' | 'gate'>;

/** Counts the columns of the preamble's measure, and the gaps between them, that fit inside a flow of a width; at least one. */
export function countPreambleColumns(flowWidth: number): number {
  const innerWidth = flowWidth - COMPOUND_PADDING_LEFT - COMPOUND_PADDING_RIGHT;
  return Math.max(1, Math.floor((innerWidth + PREAMBLE_COLUMN_GAP) / (PREAMBLE_WIDTH + PREAMBLE_COLUMN_GAP)));
}

/** Estimates the height of a flow's preamble in at most a number of columns: a heading, then the columns; zero without any entries. */
export function estimatePreambleHeight(ambient: AmbientEntry[], columnLimit: number): number {
  if (ambient.length === 0) return 0;
  return PREAMBLE_HEADING_HEIGHT + packPreamble(ambient, columnLimit).columnHeight + PREAMBLE_GAP_BELOW;
}

/**
 * Finds the lowest column height at which the entries, filled down each column and then across without splitting
 * one, take at most a number of columns, and counts the columns that they then take.
 */
export function packPreamble(ambient: AmbientEntry[], columnLimit: number): PreambleColumns {
  const heights = ambient.map(estimateEntryHeight);
  if (heights.length === 0) return { columns: 0, columnHeight: 0 };
  // A column's height is always that of a run of consecutive entries, so the lowest fitting height is one of those.
  const candidates = [...new Set(listRunHeights(heights))].toSorted((a, b) => a - b);
  let low = 0;
  let high = candidates.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (countFilledColumns(heights, candidates[middle] ?? 0) <= columnLimit) high = middle;
    else low = middle + 1;
  }
  const columnHeight = candidates[low] ?? 0;
  return { columns: countFilledColumns(heights, columnHeight), columnHeight };
}

// region | Helpers
/** Counts the columns that entries take when each column is filled down to a height before the next begins. */
function countFilledColumns(heights: number[], columnHeight: number): number {
  let columns = 1;
  let used: number | undefined;
  for (const height of heights) {
    if (used === undefined) used = height;
    else if (used + PREAMBLE_ENTRY_GAP + height <= columnHeight) used += PREAMBLE_ENTRY_GAP + height;
    else {
      columns += 1;
      used = height;
    }
  }
  return columns;
}

/** Estimates the height of one ambient instruction, clamped as the preamble clamps it. */
function estimateEntryHeight({ text, gate }: AmbientEntry): number {
  const lines = countWrappedLines([gate ? `gate ${text}` : text], PREAMBLE_WIDTH, PROMPT_CHARACTER_WIDTH);
  return Math.min(MAX_AMBIENT_LINES, lines) * PREAMBLE_LINE_HEIGHT;
}

/** Lists the height of every run of consecutive entries, with the gaps between them, that is at least as tall as the tallest entry. */
function listRunHeights(heights: number[]): number[] {
  const tallest = Math.max(...heights);
  const runHeights: number[] = [];
  for (let start = 0; start < heights.length; start += 1) {
    let height = -PREAMBLE_ENTRY_GAP;
    for (let end = start; end < heights.length; end += 1) {
      height += PREAMBLE_ENTRY_GAP + (heights[end] ?? 0);
      if (height >= tallest) runHeights.push(height);
    }
  }
  return runHeights;
}
// endregion | Helpers
