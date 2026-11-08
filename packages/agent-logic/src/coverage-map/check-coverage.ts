import { findOccurrences } from '../source/find-occurrences.ts';
import type { CoverageMap } from './coverage-map-schema.ts';
import { findPromptBlocks, type PromptBlock } from './find-prompt-blocks.ts';

/** A map entry whose quote does not occur in the prompt exactly once. */
export interface QuoteProblem {
  index: number;
  quote: string;
  occurrences: number;
}

export interface CoverageResult {
  /** The blocks that no entry's quote overlaps, in prompt order. */
  unmapped: PromptBlock[];
  quoteProblems: QuoteProblem[];
}

/**
 * Checks a coverage map against its prompt. A block is mapped when the quote of some entry, whatever element the entry
 * names, occurs in the prompt exactly once and overlaps the block.
 */
export function checkCoverage(prompt: string, map: CoverageMap): CoverageResult {
  const quoteProblems: QuoteProblem[] = [];
  const spans: Array<{ start: number; end: number }> = [];
  for (const [index, { quote }] of map.entries()) {
    const starts = findOccurrences(prompt, quote);
    const [start] = starts;
    if (starts.length === 1 && start !== undefined) spans.push({ start, end: start + quote.length });
    else quoteProblems.push({ index, quote, occurrences: starts.length });
  }
  const unmapped = findPromptBlocks(prompt).filter((block) =>
    spans.every((span) => span.end <= block.start || block.end <= span.start),
  );
  return { unmapped, quoteProblems };
}

/** Returns the block's first words, by which the checker names it. */
export function describeBlock(prompt: string, block: PromptBlock, wordCount = 8): string {
  const words = prompt.slice(block.start, block.end).trim().split(/\s+/);
  const opening = words.slice(0, wordCount).join(' ');
  return words.length > wordCount ? `${opening}…` : opening;
}
