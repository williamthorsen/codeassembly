/**
 * Text operations over a prose span, shared by the extractor and every rule's detector.
 *
 * A span preserves its source's own newlines, so an offset within it maps back to a source line by counting the
 * newlines before it. Every function here reads offsets in that coordinate space.
 */

/** Counts the newlines in `text`. */
export function countNewlines(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '\n') count += 1;
  }
  return count;
}

/** Counts the newlines before an offset, which is how an offset within a span maps back to a source line. */
export function countNewlinesBefore(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Returns the offsets covered by each inline code span, delimiters included. A run of backticks opens a span and the
 * next run of the same length closes it, which is Markdown's own rule and the reason a span may hold a backtick of its
 * own. An unclosed run delimits nothing and is passed over, leaving its backticks as ordinary text.
 */
export function findCodeSpans(text: string): ReadonlyArray<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const runs = /`+/g;
  let opening = runs.exec(text);

  while (opening !== null) {
    const closing = findClosingRun(text, runs, opening[0].length);
    if (closing === null) {
      // The run closes nothing, so it is literal text. Resuming just past it keeps every later pair in view, where
      // abandoning the scan would leave the rest of the span unread.
      runs.lastIndex = opening.index + opening[0].length;
      opening = runs.exec(text);
      continue;
    }
    spans.push({ start: opening.index, end: closing.index + closing[0].length });
    opening = runs.exec(text);
  }

  return spans;
}

/** Returns the sentence containing the range `start` to `end`, with its whitespace flattened. */
export function findSentence(text: string, start: number, end: number): string {
  const bounds = findSentenceBounds(text, start, end);
  return flattenWhitespace(text.slice(bounds.start, bounds.end));
}

/**
 * Returns the offsets bounding the sentence containing the range `start` to `end`. A range spanning a boundary yields
 * the whole run it covers, since a candidate reported across one is reported with everything a reader needs to judge
 * it. The bounds are what a caller reads to locate the sentence; {@link findSentence} returns its text.
 */
export function findSentenceBounds(text: string, start: number, end: number): { start: number; end: number } {
  const boundary = /[.!?](?=\s|$)/g;
  let sentenceStart = 0;
  let match = boundary.exec(text);

  while (match !== null) {
    const stop = match.index + 1;
    if (stop >= end) break;
    if (stop <= start) sentenceStart = stop;
    match = boundary.exec(text);
  }

  const sentenceEnd = match === null ? text.length : Math.max(match.index + 1, end);
  // The start lands just past the preceding sentence's terminator, so the whitespace separating the two belongs to
  // neither. Trimming it here is what makes the start the offset of the sentence's own first character, which is the
  // offset a caller counts newlines to.
  let trimmedStart = sentenceStart;
  while (trimmedStart < sentenceEnd && /\s/.test(text[trimmedStart] ?? '')) trimmedStart += 1;

  return { start: trimmedStart, end: sentenceEnd };
}

/** Collapses every whitespace run to one space and trims the ends, which is the form a reported span takes. */
export function flattenWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Reports whether a string literal carries enough words to read as prose rather than as data. This is the one test
 * applied to a literal by every extractor, so a help string and a YAML scalar are judged alike.
 */
export function isProseLiteral(text: string): boolean {
  return countWords(text) >= MIN_LITERAL_WORDS;
}

// region | Helpers

/** Fewest words a string literal must carry to read as prose rather than as data. */
const MIN_LITERAL_WORDS = 3;

/** Counts the word-like tokens in a string literal, which is how prose is told from data. */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[a-z]{2}/i.test(word)).length;
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
