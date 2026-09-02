/**
 * Em-dash detection.
 *
 * The rule has an exact surface form, so unlike the object relative this detector is not over-inclusive: every site it
 * reports is one. The only judgment it makes is where a dash is punctuation at all, which is what the inline-code
 * exclusion below decides. A fenced block never reaches here; the extractor holds it out already.
 */
import { countNewlinesBefore, findSentenceBounds, flattenWhitespace } from './span-text.ts';
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

/**
 * Returns the offsets covered by each inline code span, delimiters included. A run of backticks opens a span and the
 * next run of the same length closes it, which is Markdown's own rule and the reason a span may hold a backtick of its
 * own. An unclosed run delimits nothing and is passed over, leaving its backticks as ordinary text.
 */
function findCodeSpans(text: string): ReadonlyArray<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const runs = /`+/g;
  let opening = runs.exec(text);

  while (opening !== null) {
    const closing = findClosingRun(text, runs, opening[0].length);
    if (closing === null) break;
    spans.push({ start: opening.index, end: closing.index + closing[0].length });
    opening = runs.exec(text);
  }

  return spans;
}

/** Advances `runs` to the next backtick run of exactly `length`, or returns null where the text holds none. */
function findClosingRun(text: string, runs: RegExp, length: number): RegExpExecArray | null {
  let candidate = runs.exec(text);
  while (candidate !== null && candidate[0].length !== length) {
    candidate = runs.exec(text);
  }
  return candidate;
}

// endregion | Helpers
