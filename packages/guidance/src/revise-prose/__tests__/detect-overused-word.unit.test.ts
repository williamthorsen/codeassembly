import { describe, expect, it } from 'vitest';

import { detectOverusedWords } from '../detect-overused-word.ts';
import type { OverusedWordCandidate, ProseSpan } from '../types.ts';

describe(detectOverusedWords, () => {
  it('reports a sentence containing a watchlist word, with the sentence as the phrase', () => {
    expect(detect('The fix will land in this release.')).toStrictEqual([
      {
        rule: 'overused-word',
        file: 'docs/guide.md',
        line: 1,
        phrase: 'The fix will land in this release.',
        sentence: 'The fix will land in this release.',
        words: ['land'],
      },
    ]);
  });

  it.each([
    ['a regular inflection', 'The change carries a flag.', 'carry'],
    ['an -ing form', 'The review is surfacing findings.', 'surface'],
    ['held', 'The caller held the state.', 'hold'],
    ['sat', 'The note sat outside the body.', 'sit'],
    ['stood', 'The team stood up a fixture.', 'stand'],
  ])('reports %s under its watchlist word', (_label, text, word) => {
    expect(detect(text).map((candidate) => candidate.words)).toStrictEqual([[word]]);
  });

  it('reports a word in any case', () => {
    expect(detect('Ships without a test.')).toHaveLength(1);
  });

  it('passes over a derivative, which the list does not name', () => {
    expect(detect('The standard is costly, and the shipment is late.')).toStrictEqual([]);
  });

  it('passes over a word inside an inline code span', () => {
    expect(detect('Call `route` with the finding.')).toStrictEqual([]);
  });

  it('passes over the fixed phrase "stand in for" in any inflection', () => {
    expect(detect('The stub stands in for the client, as a fake stood in for it before.')).toStrictEqual([]);
  });

  it('still reports another form of stand in a sentence that contains "stand in for"', () => {
    expect(detect('The stub stands in for the client, and the claim stands.')).toHaveLength(1);
  });

  it('reports one candidate for a sentence containing two words, listing each once in reading order', () => {
    expect(detect('The change reaches the machine and carries a flag that reached it.')).toMatchObject([
      { words: ['reach', 'carry'] },
    ]);
  });

  it('reports the line on which the sentence begins, not the first line of the span', () => {
    const candidates = detectOverusedWords([
      { file: 'docs/guide.md', line: 4, text: 'First sentence.\nThe fix lands here.' },
    ]);

    expect(candidates[0]?.line).toBe(5);
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape most assertions above read. */
function detect(text: string): OverusedWordCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectOverusedWords([span]);
}

// endregion | Helpers
