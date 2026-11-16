import { type CoverageResult, describeBlock } from './check-coverage.ts';

/**
 * Formats a coverage check's findings as lines: each quote that does not occur exactly once, as `map[<index>]: …`,
 * then each unmapped block, as `line <N>: <opening words>`. Returns no lines when every block is mapped.
 */
export function formatCoverageResult(prompt: string, { unmapped, quoteProblems }: CoverageResult): string[] {
  return [
    ...quoteProblems.map(
      ({ index, quote, occurrences }) => `map[${index}]: ${JSON.stringify(quote)} occurs ${occurrences} times`,
    ),
    ...unmapped.map((block) => `line ${block.line}: ${describeBlock(prompt, block)}`),
  ];
}
