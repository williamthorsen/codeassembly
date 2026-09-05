/**
 * The scan that locates a `#` comment on one line, shared by the shell and YAML extractors.
 *
 * Both kinds open a comment the same way: a `#` at the start of a line or preceded by whitespace, outside any quoted
 * string. What differs is the region over which the scan runs, which each extractor decides for itself.
 */

/** Returns the index of the `#` opening a comment, or -1 where the line carries none outside a quoted string. */
export function findHashCommentStart(line: string): number {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\' && quote !== "'") {
      index += 1;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return index;
    }
  }
  return -1;
}
