import { describe, expect, it } from 'vitest';

import { detectSoUses } from '../detect-so.ts';
import type { ProseSpan, SoCandidate } from '../types.ts';

describe(detectSoUses, () => {
  it('reports a sentence joining two clauses, with the sentence as the phrase', () => {
    expect(detect('The cache is cold, so the first request is slow.')).toStrictEqual([
      {
        rule: 'so',
        file: 'docs/guide.md',
        line: 1,
        phrase: 'The cache is cold, so the first request is slow.',
        sentence: 'The cache is cold, so the first request is slow.',
      },
    ]);
  });

  it.each([
    'The loader warms the cache so the first request is fast.',
    'So the gate is the union of their file lists.',
    'The record is stale, and so the sweep runs again.',
    'The owning source decides it and so is supplied per skill.',
    'The cache is cold, so many requests are slow.',
    'The run is so slow.',
  ])('reports "%s"', (text) => {
    expect(detect(text)).toHaveLength(1);
  });

  it.each([
    'Warm the cache so that the first request is fast.',
    'The so-called exhibit stays.',
    'Report the dirty tree before doing so.',
    'If so, stop the run.',
    'The rule says so.',
    'The run has passed so far.',
    'It reads so many files.',
    'Skills, subagents, and so on.',
  ])('passes over "%s"', (text) => {
    expect(detect(text)).toStrictEqual([]);
  });

  it('passes over the word inside an inline code span', () => {
    expect(detect('Name the rule `so` on the command line.')).toStrictEqual([]);
  });

  it('reports one candidate for a sentence holding the word twice', () => {
    expect(detect('The cache is cold, so the loader warms it, so the request is fast.')).toHaveLength(1);
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape most assertions above read. */
function detect(text: string): SoCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectSoUses([span]);
}

// endregion | Helpers
