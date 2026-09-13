/**
 * Em-dash detection.
 *
 * The rule has an exact surface form, so unlike the object relative this detector is not over-inclusive: every site it
 * reports is one. The only judgment it makes is where a dash is punctuation at all, which the inline-code exclusion
 * decides. A sweep never reaches that judgment: the extractor holds a fenced block out and masks an inline code span
 * before a span arrives. The exclusion holds for a caller that builds its own spans.
 */
import { findMatchingSentences } from './span-text.ts';
import type { EmDashCandidate, ProseSpan } from './types.ts';

/**
 * Scans every span for em-dashes, returning one candidate per sentence that holds at least one, in reading order. The
 * phrase is the sentence because a dash on its own resolves to nothing: A rejection recorded against one character
 * would match every other dash in the file.
 */
export function detectEmDashes(spans: readonly ProseSpan[]): EmDashCandidate[] {
  return spans.flatMap((span) =>
    findMatchingSentences(span, EM_DASH).map(({ line, sentence }): EmDashCandidate => ({
      rule: 'em-dash',
      file: span.file,
      line,
      phrase: sentence,
      sentence,
    })),
  );
}

// region | Helpers

const EM_DASH = /\u{2014}/gu;

// endregion | Helpers
