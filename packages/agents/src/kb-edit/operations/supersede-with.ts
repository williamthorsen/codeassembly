import { relative } from 'node:path';

import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder, formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Prepares the in-memory edits that link two notes into a supersede chain: the old note gains a forward pointer and a
 * `deprecated` tag, the new note gains a back pointer, and both gain a bumped `updated`.
 *
 * The pointers are KB-relative, so a vault can be moved without rewriting every chain.
 */
export function prepareSupersedeWith(input: {
  oldRecord: KbAssertion;
  oldPath: string;
  newRecord: KbAssertion;
  newPath: string;
  kbPath: string;
  aliases: AliasMap;
  now: Date;
}): { old: KbAssertion; new: KbAssertion } {
  const today = formatUtcTimestamp(input.now);
  const oldRelative = relative(input.kbPath, input.oldPath);
  const newRelative = relative(input.kbPath, input.newPath);

  const oldTagsWithDeprecated = addDeprecatedTag({ existingTags: input.oldRecord.tags, aliases: input.aliases });

  const old: KbAssertion = {
    ...input.oldRecord,
    tags: oldTagsWithDeprecated,
    updated: today,
    supersededBy: newRelative,
  };

  const superseding: KbAssertion = {
    ...input.newRecord,
    updated: today,
    supersedes: oldRelative,
  };

  return { old, new: superseding };
}

/** Adds the `deprecated` tag to a list, canonicalizing through the alias map and deduping in first-occurrence order. */
function addDeprecatedTag(input: { existingTags: readonly string[]; aliases: AliasMap }): string[] {
  const canonicalDeprecated = canonicalize('deprecated', input.aliases);
  return dedupeInOrder([...input.existingTags, canonicalDeprecated]);
}
