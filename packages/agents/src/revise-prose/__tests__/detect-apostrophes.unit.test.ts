import { describe, expect, it } from 'vitest';

import { detectDroppedApostrophes } from '../detect-apostrophes.ts';
import type { ApostrophesCandidate, ProseSpan } from '../types.ts';

/** The rejection grounds whose possessives an agent dropped from a sweep record, as they were committed. */
const STRIPPED_GROUNDS: ReadonlyArray<string> = [
  'a marked exhibit: the before half of case 2 own before/after pair',
  'a marked exhibit: the rule own example of the all-purpose verb it forbids',
  'a marked exhibit: the rule own example of the all-purpose verb it forbids',
  'a marked exhibit: the rule own example of the all-purpose verb it forbids',
  'a marked exhibit: the rule own example of the verbs it forbids',
  'a marked exhibit: the watchlist own example of the use it forbids',
  'not the construction: "hands" is the sentences own verb and "the recorded sites" its object',
  'not the construction: the verb is the sentences own, with "it" as its subject',
  'not the construction: the verb is the sentences own, with "it" as its subject',
  'not the construction: "widen" is the sentences own imperative verb and "it" its object',
];

describe(detectDroppedApostrophes, () => {
  it('reports a sentence holding a dropped possessive, with the sentence as the phrase', () => {
    expect(detect('It is the rule own example.')).toStrictEqual([
      {
        rule: 'apostrophes',
        file: 'docs/guide.md',
        line: 1,
        phrase: 'It is the rule own example.',
        sentence: 'It is the rule own example.',
      },
    ]);
  });

  it.each(STRIPPED_GROUNDS)('reports the stripped ground "%s"', (ground) => {
    expect(detect(ground)).toHaveLength(1);
  });

  it.each([
    'The developers own the decision.',
    'Teams own their services.',
    'It stands on its own.',
    'It is the rule\u{0027}s own example.',
    'It is the rule\u{2019}s own example.',
    'The users\u{0027} own settings stay.',
    'Each lane has a home of its own.',
    'They own it.',
    'Agents who own a ticket close it.',
    'The team will own the release.',
    'The package owns its schema, and it is owned by one team.',
  ])('passes over "%s", which does not drop a possessive', (text) => {
    expect(detect(text)).toStrictEqual([]);
  });

  it.each([
    'dont',
    'Dont',
    'doesnt',
    'isnt',
    'cant',
    'wont',
    'wouldnt',
    'youre',
    'theyre',
    'weve',
    'thats',
    'whats',
    'theres',
    'couldve',
    'hed',
    'heres',
    'itll',
    'ive',
    'shouldve',
    'thatll',
    'wheres',
    'whos',
    'wouldve',
  ])('reports the contraction %s', (word) => {
    expect(detect(`The check says ${word} matter.`)).toHaveLength(1);
  });

  it.each(['were', 'well', 'its', 'ill', 'id', 'wed', 'shell', 'hell', 'lets', 'hes', 'shes'])(
    'passes over %s, which is also a word',
    (word) => {
      expect(detect(`The check says ${word} matter.`)).toStrictEqual([]);
    },
  );

  it.each(["don't", 'don\u{2019}t', 'dontcare', 'undont'])(
    'passes over %s, which is not a dropped contraction',
    (word) => {
      expect(detect(`The check says ${word} matter.`)).toStrictEqual([]);
    },
  );

  it('passes over a site inside an inline code span', () => {
    expect(detect('The fixture reads `the rule own example` and `dont`.')).toStrictEqual([]);
  });

  it('reports one candidate for a sentence holding both shapes', () => {
    expect(detect('The rule own example says dont.')).toHaveLength(1);
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape most assertions above read. */
function detect(text: string): ApostrophesCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectDroppedApostrophes([span]);
}

// endregion | Helpers
