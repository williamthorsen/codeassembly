import { describe, expect, it } from 'vitest';

import { checkCoverage, describeBlock } from '../check-coverage.ts';

const PROMPT = 'Greet the user.\n\n- Look up the order.\n- Refund it, then refund it again if asked.';

describe(checkCoverage, () => {
  it('reports nothing when every block overlaps a quote', () => {
    const result = checkCoverage(PROMPT, [
      { quote: 'Greet the user', element: 'greeting' },
      { quote: 'Look up', element: 'looking_up' },
      { quote: 'again if asked', element: 'refunding' },
    ]);

    expect(result).toStrictEqual({ unmapped: [], quoteProblems: [] });
  });

  it('lists each block that no quote overlaps', () => {
    const result = checkCoverage(PROMPT, [{ quote: 'Look up the order', element: 'looking_up' }]);

    expect(result.unmapped.map(({ line }) => line)).toStrictEqual([1, 4]);
  });

  it('counts an entry that names no element as mapping its block', () => {
    const result = checkCoverage('Greet the user.', [{ quote: 'Greet', element: 'none' }]);

    expect(result.unmapped).toStrictEqual([]);
  });

  it('reports a quote that is missing or ambiguous, and does not let it map a block', () => {
    const result = checkCoverage(PROMPT, [
      { quote: 'Greet the user', element: 'greeting' },
      { quote: 'Look up the ticket', element: 'looking_up' },
      { quote: 'efund it', element: 'refunding' },
    ]);

    expect(result.quoteProblems).toStrictEqual([
      { index: 1, quote: 'Look up the ticket', occurrences: 0 },
      { index: 2, quote: 'efund it', occurrences: 2 },
    ]);
    expect(result.unmapped.map(({ line }) => line)).toStrictEqual([3, 4]);
  });
});

describe(describeBlock, () => {
  it('names a block by its first words, with an ellipsis when it has more', () => {
    const prompt = 'One two three four five six seven eight nine.';

    expect(describeBlock(prompt, { start: 0, end: prompt.length, line: 1 })).toBe(
      'One two three four five six seven eight…',
    );
    expect(describeBlock('Short one.', { start: 0, end: 10, line: 1 })).toBe('Short one.');
  });
});
