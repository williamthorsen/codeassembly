/**
 * Inline-code masking for the prose sweep.
 *
 * A detector reads prose word by word, and the content of an inline code span is not prose: its tokens are
 * identifiers, flags, and file names. Masking puts one placeholder in each span's place before any detector reads the
 * text, so the span contributes no words while the words on either side of it stay as far apart as the source wrote
 * them.
 */
import { countNewlines, findCodeSpans } from './span-text.ts';

/** The token standing in an inline code span's place, which is what a reported phrase carries where a span stood. */
export const CODE_SPAN_PLACEHOLDER = '«codespan»';

/** The placeholder as a tokenizer reads it, with the delimiters stripped and the rest lowercased. */
export const CODE_SPAN_PLACEHOLDER_WORD = CODE_SPAN_PLACEHOLDER.replace(/^[^\p{L}\p{N}]+/u, '')
  .replace(/[^\p{L}\p{N}]+$/u, '')
  .toLowerCase();

/**
 * Replaces every inline code span in `text` with {@link CODE_SPAN_PLACEHOLDER}. The newlines a span covered are
 * re-emitted after the placeholder, so an offset past the span still maps back to the source line holding it.
 */
export function maskCodeSpans(text: string): string {
  const spans = findCodeSpans(text);
  if (spans.length === 0) return text;

  const parts: string[] = [];
  let read = 0;

  for (const span of spans) {
    const covered = text.slice(span.start, span.end);
    // The placeholder is spaced because a tokenizer splits on whitespace: written flush against the word beside it,
    // the two fuse into one token.
    parts.push(text.slice(read, span.start), ` ${CODE_SPAN_PLACEHOLDER} `, '\n'.repeat(countNewlines(covered)));
    read = span.end;
  }
  parts.push(text.slice(read));

  return parts.join('');
}
