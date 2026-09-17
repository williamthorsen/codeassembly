import { splitCommaList } from './note-helpers.ts';

/**
 * Splits a comma-separated tag string into individual tags.
 * @internal
 */
export function parseTagList(value: string): string[] {
  return splitCommaList(value);
}
