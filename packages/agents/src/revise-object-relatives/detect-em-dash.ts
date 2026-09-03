/**
 * Em-dash detection.
 *
 * The rule has an exact surface form, so unlike the object relative this detector is not over-inclusive: every site it
 * reports is one. The only judgment it makes is where a dash is punctuation at all, which the inline-code exclusion
 * decides. A sweep never reaches that judgment: the extractor holds a fenced block out and masks an inline code span
 * before a span arrives. The exclusion holds for a caller that builds its own spans.
 */
import { countNewlinesBefore, findCodeSpans, findSentenceBounds, flattenWhitespace } from './span-text.ts';
import type { EmDashCandidate, ProseSpan } from './types.ts';

/** Scans every span for em-dashes, returning one candidate per sentence that holds at least one, in reading order. */
export function detectEmDashes(spans: readonly ProseSpan[]): EmDashCandidate[] {
  const candidates: EmDashCandidate[] = [];
  for (const span of spans) {
    candidates.push(...detectInSpan(span));
  }
  return candidates;
}

// region | Helpers

const EM_DASH = '\u{2014}';

/**
 * Reports every em-dash sentence in one span. A sentence holding two dashes yields one candidate: the phrase is the
 * whole sentence, so a second candidate would carry the same rejection key as the first and adjudicate the same text.
 */
function detectInSpan(span: ProseSpan): EmDashCandidate[] {
  const codeSpans = findCodeSpans(span.text);
  const candidates: EmDashCandidate[] = [];
  let reportedSentenceStart = -1;

  for (let index = 0; index < span.text.length; index += 1) {
    if (span.text[index] !== EM_DASH) continue;
    if (codeSpans.some((code) => index >= code.start && index < code.end)) continue;

    const bounds = findSentenceBounds(span.text, index, index + 1);
    if (bounds.start === reportedSentenceStart) continue;
    reportedSentenceStart = bounds.start;

    // The phrase is the sentence because a dash on its own resolves to nothing: a rejection recorded against one
    // character would match every other dash in the file.
    const sentence = flattenWhitespace(span.text.slice(bounds.start, bounds.end));
    candidates.push({
      rule: 'em-dash',
      file: span.file,
      line: span.line + countNewlinesBefore(span.text, bounds.start),
      phrase: sentence,
      sentence,
    });
  }

  return candidates;
}

// endregion | Helpers
