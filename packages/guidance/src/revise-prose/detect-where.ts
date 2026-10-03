/**
 * `where` detection.
 *
 * The rule permits two senses: A `where` naming a place stands, as does one that follows an expression and states what a
 * symbol in it stands for, and every other use is the violation. Only a reading tells the senses apart, so the detector
 * reports every sentence holding the word and leaves the sense to the adjudicator.
 */
import { findMatchingSentences } from './span-text.ts';
import type { ProseSpan, WhereCandidate } from './types.ts';

/**
 * Scans every span for the word `where`, returning one candidate per sentence that holds it, in reading order.
 */
export function detectWhereUses(spans: readonly ProseSpan[]): WhereCandidate[] {
  return spans.flatMap((span) =>
    findMatchingSentences(span, WHERE).map(({ line, sentence }): WhereCandidate => ({
      rule: 'where',
      file: span.file,
      line,
      phrase: sentence,
      sentence,
    })),
  );
}

// region | Helpers

/** The word in any case. A compound such as `wherever` or `elsewhere` is another word, which the rule does not govern. */
const WHERE = /\bwhere\b/giu;

// endregion | Helpers
