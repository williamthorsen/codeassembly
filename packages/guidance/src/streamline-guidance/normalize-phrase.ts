import { flattenWhitespace } from '../revise-prose/span-text.ts';

/** Renders text in the form in which phrases are compared: NFC, with whitespace collapsed so that a reflow cannot matter. */
export function normalizePhrase(text: string): string {
  return flattenWhitespace(text.normalize('NFC'));
}
