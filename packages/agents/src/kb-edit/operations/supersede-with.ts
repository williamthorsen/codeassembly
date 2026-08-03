import { relative } from 'node:path';

import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder, formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Prepares the in-memory edits for `--supersede-with`. Old note: `supersededBy` pointer plus a `deprecated` tag
 * (canonicalized through the alias map, idempotent if already present). New note: `supersedes` pointer. Both notes'
 * `updated` are bumped.
 *
 * Pointers are written KB-relative so a vault can be moved without rewriting every chain. The KB-relative computation
 * runs here so the operation owns its pointer convention rather than scattering `relative()` calls across the
 * orchestrator.
 *
 * Returns only the prepared records per file. The atomic two-file write is the caller's job (see `runEdit`), because
 * rollback is tied to the on-disk staging sequence and lives at that layer.
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

/**
 * Adds the `deprecated` tag to a list, canonicalizing through the alias map and deduping in first-occurrence order.
 * Already-present (canonical) `deprecated` results in a no-op.
 */
function addDeprecatedTag(input: { existingTags: readonly string[]; aliases: AliasMap }): string[] {
  const canonicalDeprecated = canonicalize('deprecated', input.aliases);
  return dedupeInOrder([...input.existingTags, canonicalDeprecated]);
}
