/**
 * Dropped-apostrophe detection.
 *
 * An agent that composes text inside a single-quoted shell string can drop every apostrophe rather than escape it, and
 * the result still parses. Only two shapes of the loss are unambiguous, so the detector reports those and misses the
 * rest: the adjective `own` without the possessive before it, and a contraction whose apostrophe-less form is not also
 * a word. Every site is the adjudicator's to confirm.
 */
import { findMatchingSentences } from './span-text.ts';
import type { ApostrophesCandidate, ProseSpan } from './types.ts';

/**
 * Scans every span for a dropped apostrophe, returning one candidate per sentence that contains at least one, in
 * reading order.
 */
export function detectDroppedApostrophes(spans: readonly ProseSpan[]): ApostrophesCandidate[] {
  return spans.flatMap((span) =>
    findMatchingSentences(span, DROPPED_APOSTROPHE).map(({ line, sentence }): ApostrophesCandidate => ({
      rule: 'apostrophes',
      file: span.file,
      line,
      phrase: sentence,
      sentence,
    })),
  );
}

// region | Helpers

/**
 * Apostrophe-less contractions that are not also words. `were`, `well`, `its`, `ill`, `id`, `wed`, `shell`, `hell`,
 * `lets`, `hes`, and `shes` are words, and they stay out; `cant` and `wont` are rare enough as words to stay in.
 */
const CONTRACTIONS: ReadonlyArray<string> = [
  'arent',
  'cant',
  'couldnt',
  'didnt',
  'doesnt',
  'dont',
  'hadnt',
  'hasnt',
  'havent',
  'isnt',
  'mustnt',
  'neednt',
  'shouldnt',
  'thats',
  'theres',
  'theyd',
  'theyll',
  'theyre',
  'theyve',
  'wasnt',
  'werent',
  'weve',
  'whats',
  'wont',
  'wouldnt',
  'youd',
  'youll',
  'youre',
  'youve',
];

/**
 * Words after which `own` is not a dropped possessive: a possessive determiner (`their own`), a word that makes `own` a
 * verb (`to own`, `they own`), or a preposition (`for own`). A word that ends in an apostrophe or in `'s` never reaches
 * this list, because the pattern requires a letter or a digit directly before the space.
 */
const NON_POSSESSOR_WORDS: ReadonlyArray<string> = [
  'also',
  'and',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'her',
  'his',
  'i',
  'its',
  'jointly',
  'may',
  'might',
  'must',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'shall',
  'should',
  'still',
  'that',
  'their',
  'they',
  'to',
  'we',
  'which',
  'who',
  'whose',
  'will',
  'would',
  'you',
  'your',
];

/** Words that open the object of the verb `own`, as in `developers own the decision`. */
const OBJECT_OPENERS: ReadonlyArray<string> = [
  'a',
  'all',
  'an',
  'any',
  'each',
  'every',
  'her',
  'his',
  'it',
  'its',
  'my',
  'our',
  'some',
  'that',
  'the',
  'their',
  'them',
  'these',
  'this',
  'those',
  'your',
];

/** A letter, a digit, or an apostrophe, whose presence on either side of a match means the match is inside a word. */
const WORD_CHARACTER = String.raw`[\p{L}\p{N}'\u{2019}]`;

/** `own` after a word that does not possess anything, and before something other than the verb's object. */
const DROPPED_POSSESSIVE = String.raw`(?<!${WORD_CHARACTER})(?!(?:${NON_POSSESSOR_WORDS.join('|')})\s)[\p{L}\p{N}]+\s+own(?!${WORD_CHARACTER})(?!\s+(?:${OBJECT_OPENERS.join('|')})(?!${WORD_CHARACTER}))`;

const DROPPED_CONTRACTION = String.raw`(?<!${WORD_CHARACTER})(?:${CONTRACTIONS.join('|')})(?!${WORD_CHARACTER})`;

const DROPPED_APOSTROPHE = new RegExp(`${DROPPED_POSSESSIVE}|${DROPPED_CONTRACTION}`, 'giu');

// endregion | Helpers
