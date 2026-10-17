/**
 * Em-dash detection.
 *
 * The rule has an exact surface form, so unlike the object relative this detector is not over-inclusive: Every site
 * that it reports is one. The only judgment that it makes is whether a dash is punctuation at all, which the
 * inline-code exclusion decides. A sweep never needs that judgment: The extractor drops a fenced block and masks an
 * inline code span before the detector receives a span. The exclusion holds for a caller that builds its own spans.
 */
import { findMatchingSentences } from './span-text.ts';
import type { EmDashCandidate, ProseSpan } from './types.ts';

/**
 * Scans every span for em-dashes, returning one candidate per sentence that contains at least one, in reading order.
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
