/**
 * Text operations over a prose span, shared by every rule's detector.
 *
 * A span preserves its source's own newlines, so an offset within it maps back to a source line by counting the
 * newlines before it. Every function here reads offsets in that coordinate space.
 */

/** Counts the newlines before an offset, which is how an offset within a span maps back to a source line. */
export function countNewlinesBefore(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
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
