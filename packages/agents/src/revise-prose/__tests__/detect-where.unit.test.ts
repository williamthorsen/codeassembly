import { describe, expect, it } from 'vitest';

import { detectWhereUses } from '../detect-where.ts';
import type { ProseSpan, WhereCandidate } from '../types.ts';

describe(detectWhereUses, () => {
  it('reports a sentence holding the word, with the sentence as the phrase', () => {
    expect(detect('Skip the batch where the record covers it.')).toStrictEqual([
      {
        rule: 'where',
        file: 'docs/guide.md',
        line: 1,
        phrase: 'Skip the batch where the record covers it.',
        sentence: 'Skip the batch where the record covers it.',
      },
    ]);
  });

  it('reports the word in any case', () => {
    expect(detect('Where a unit names no rule, nothing is detected.')).toHaveLength(1);
  });

  it('passes over a compound, which is another word', () => {
    expect(detect('Run it wherever the tree is clean, and nowhere else.')).toStrictEqual([]);
  });

  it('reports one candidate for a sentence holding the word twice', () => {
    expect(detect('The file where it lives is where it stays.')).toHaveLength(1);
  });

  it('passes over the word inside an inline code span', () => {
    expect(detect('The query takes a `where` clause.')).toStrictEqual([]);
  });

  it('reports the line on which the sentence begins, not the first line of the span', () => {
    const candidates = detectWhereUses([{ file: 'docs/guide.md', line: 4, text: 'First sentence.\nSecond, where.' }]);

    expect(candidates[0]?.line).toBe(5);
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape most assertions above read. */
function detect(text: string): WhereCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectWhereUses([span]);
}

// endregion | Helpers
