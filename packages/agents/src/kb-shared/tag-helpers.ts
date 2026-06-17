import { splitCommaList } from './note-helpers.ts';

/**
 * Splits a comma-separated tag string into individual tags, dropping empties and trimming whitespace.
 * @internal
 */
export function parseTagList(value: string): string[] {
  return splitCommaList(value);
}
