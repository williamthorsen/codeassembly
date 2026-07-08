import { asStringList } from '../note-io/field-validators.ts';
import { findAliasFor } from '../tags/canonicalize.ts';
import type { AliasMap, Finding } from '../types.ts';

/** The note fields the tag-alias lint reads: its path and its raw frontmatter field map. */
export interface TagAliasNote {
  path: string;
  fields: Record<string, unknown>;
}

/**
 * Warns when a note's `tags` list contains a known alias, naming the canonical form, in list order (`tag-alias`,
 * warning). Unknown tags (neither canonical nor alias) are new vocabulary and are not flagged; a `tags` value that is
 * absent or not a list yields no findings. Each finding points at the note, not a specific tag line.
 */
export function tagAliasFindings(note: TagAliasNote, aliases: AliasMap): Finding[] {
  const tags = asStringList(note.fields.tags);
  if (tags === null) {
    return [];
  }

  const findings: Finding[] = [];
  for (const tag of tags) {
    const canonical = findAliasFor(tag, aliases);
    if (canonical === null) continue;
    findings.push({
      path: note.path,
      rule: 'tag-alias',
      severity: 'warning',
      message: `tag "${tag}" is an alias — use canonical form "${canonical}"`,
    });
  }
  return findings;
}
