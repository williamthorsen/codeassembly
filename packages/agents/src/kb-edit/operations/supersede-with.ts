import { relative } from 'node:path';

import type { AliasMap, Frontmatter, ParsedNote } from '@codeassembly/kb';
import { canonicalize } from '@codeassembly/kb/tags';

import { dedupeInOrder, formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Prepares the in-memory edits for `--supersede-with`. Old note: `superseded-by` pointer plus a `deprecated` tag
 * (canonicalized through the alias map, idempotent if already present). New note: `supersedes` pointer. Both notes'
 * `updated:` are bumped.
 *
 * Pointers are written KB-relative so a vault can be moved without rewriting every chain. The KB-relative
 * computation runs here so the operation owns its pointer convention rather than scattering `relative()` calls
 * across the orchestrator.
 *
 * Returns only the prepared `{ frontmatter, body }` pair per file. The atomic two-file write is the caller's job
 * (see `runEdit`), because rollback is tied to the on-disk staging sequence and lives at that layer.
 */
export function prepareSupersedeWith(input: {
  oldNote: ParsedNote;
  oldFrontmatter: Frontmatter;
  newNote: ParsedNote;
  newFrontmatter: Frontmatter;
  kbPath: string;
  aliases: AliasMap;
  now: Date;
}): {
  old: { frontmatter: Frontmatter; body: string };
  new: { frontmatter: Frontmatter; body: string };
} {
  const today = formatUtcTimestamp(input.now);
  const oldRelative = relative(input.kbPath, input.oldNote.path);
  const newRelative = relative(input.kbPath, input.newNote.path);

  const oldTagsWithDeprecated = addDeprecatedTag({
    existingTags: input.oldFrontmatter.tags,
    aliases: input.aliases,
  });

  const oldPrepared: Frontmatter = {
    ...input.oldFrontmatter,
    tags: oldTagsWithDeprecated,
    updated: today,
    extra: { ...input.oldFrontmatter.extra, 'superseded-by': newRelative },
  };

  const newPrepared: Frontmatter = {
    ...input.newFrontmatter,
    updated: today,
    extra: { ...input.newFrontmatter.extra, supersedes: oldRelative },
  };

  return {
    old: { frontmatter: oldPrepared, body: input.oldNote.body },
    new: { frontmatter: newPrepared, body: input.newNote.body },
  };
}

/**
 * Adds the `deprecated` tag to a list, canonicalizing through the alias map and deduping in first-occurrence
 * order. Already-present (canonical) `deprecated` results in a no-op.
 */
function addDeprecatedTag(input: { existingTags: readonly string[]; aliases: AliasMap }): string[] {
  const canonicalDeprecated = canonicalize('deprecated', input.aliases);
  return dedupeInOrder([...input.existingTags, canonicalDeprecated]);
}
