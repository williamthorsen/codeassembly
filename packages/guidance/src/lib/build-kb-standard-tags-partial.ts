import { readFile } from 'node:fs/promises';

import { STANDARD_TAGS, type StandardTag } from '@williamthorsen/kb/tags';

import { isMissingFile } from './type-guards.ts';

/** Whether a committed standard-tags partial matches what the build writes. */
export type KbStandardTagsPartialState = 'current' | 'missing' | 'stale';

/** Renders the partial that the tag-writing skills include: a heading, a directive, and one bullet per tag. */
export function buildKbStandardTagsPartial(tags: readonly StandardTag[] = STANDARD_TAGS): string {
  const bullets = tags.map((entry) => `- \`${entry.tag}\`: ${entry.meaning}`);
  return [
    '## Standard tags',
    '',
    "Every knowledge store shares these tags. Tag a record's disposition with one of these names, never with a variant spelling:",
    '',
    ...bullets,
    '',
  ].join('\n');
}

/** Compares the file at `filePath` byte for byte with the partial that the build writes. */
export async function checkKbStandardTagsPartial(
  filePath: string,
  content: string = buildKbStandardTagsPartial(),
): Promise<KbStandardTagsPartialState> {
  let existing: string;
  try {
    existing = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return 'missing';
    }
    throw error;
  }
  return existing === content ? 'current' : 'stale';
}
