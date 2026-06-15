/**
 * Splits a comma-separated tag string into individual tags, dropping empties and trimming whitespace.
 * @internal
 */
export function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
