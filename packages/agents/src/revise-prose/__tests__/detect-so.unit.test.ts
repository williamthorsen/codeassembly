import { describe, expect, it } from 'vitest';

import { detectSoUses } from '../detect-so.ts';
import type { ProseSpan, SoCandidate } from '../types.ts';

describe(detectSoUses, () => {
  describe('a bare so', () => {
    it('reports the sentence, with the sentence as the phrase', () => {
      expect(detect('The loader warms the cache so the first request is fast.')).toStrictEqual([
        {
          rule: 'so',
          file: 'docs/guide.md',
          line: 1,
          phrase: 'The loader warms the cache so the first request is fast.',
          sentence: 'The loader warms the cache so the first request is fast.',
          trigger: 'bare',
        },
      ]);
    });

    it('reports a degree adverb before an adjective, which no neighboring word distinguishes from a purpose clause', () => {
      expect(detect('The run is so slow.')).toStrictEqual([expect.objectContaining({ trigger: 'bare' })]);
    });
  });

  it.each([
    'The cache is cold, so the first request is slow.',
    'The cache is cold; so the first request is slow.',
    'The cache is cold -- so the first request is slow.',
    'The cache is cold — so the first request is slow.',
    'The record is stale, and so the sweep runs again.',
    'The owning source decides it and so is supplied per skill.',
    'So the gate is the union of their file lists.',
    'The cache is cold, so many requests are slow.',
    'So many requests are slow.',
  ])('passes over a lone so after a result marker: "%s"', (text) => {
    expect(detect(text)).toStrictEqual([]);
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
  ])('passes over a use outside the rule: "%s"', (text) => {
    expect(detect(text)).toStrictEqual([]);
  });

  it('passes over the word inside an inline code span', () => {
    expect(detect('Name the rule `so` on the command line.')).toStrictEqual([]);
  });

  describe('a repeat', () => {
    it('reports one candidate for a sentence holding two sites', () => {
      expect(detect('The cache is cold, so the loader warms it, so the request is fast.')).toStrictEqual([
        expect.objectContaining({ trigger: 'repeat' }),
      ]);
    });

    it('reports a site in the third sentence after another, and not the earlier site', () => {
      const text =
        'The cache is cold, so the request is slow. The loader runs. The index grows. The disk fills, so the job fails.';

      expect(detect(text)).toStrictEqual([
        expect.objectContaining({ sentence: 'The disk fills, so the job fails.', trigger: 'repeat' }),
      ]);
    });

    it('passes over a site in the fourth sentence after another', () => {
      const text =
        'The cache is cold, so the request is slow. The loader runs. The index grows. The queue waits. The disk fills, so the job fails.';

      expect(detect(text)).toStrictEqual([]);
    });

    it('counts sentences across the spans of one file, in line order', () => {
      const spans: ProseSpan[] = [
        { file: 'docs/guide.md', line: 5, text: 'The disk fills, so the job fails.' },
        { file: 'docs/guide.md', line: 1, text: 'The cache is cold, so the request is slow.' },
      ];

      expect(detectSoUses(spans)).toStrictEqual([expect.objectContaining({ line: 5, trigger: 'repeat' })]);
    });

    it('does not count a site in another file', () => {
      const spans: ProseSpan[] = [
        { file: 'docs/guide.md', line: 1, text: 'The cache is cold, so the request is slow.' },
        { file: 'docs/other.md', line: 2, text: 'The disk fills, so the job fails.' },
      ];

      expect(detectSoUses(spans)).toStrictEqual([]);
    });

    it('does not count "so that" toward the gap', () => {
      expect(detect('Warm the cache so that the request is fast. The disk fills, so the job fails.')).toStrictEqual([]);
    });

    it('reports a bare site that is also a repeat as bare', () => {
      const text = 'The cache is cold, so the loader runs. The loader warms it so the request is fast.';

      expect(detect(text)).toStrictEqual([
        expect.objectContaining({ sentence: 'The loader warms it so the request is fast.', trigger: 'bare' }),
      ]);
    });
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape most assertions above read. */
function detect(text: string): SoCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectSoUses([span]);
}

// endregion | Helpers
