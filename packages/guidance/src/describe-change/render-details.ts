import type { Taxonomy, WorkTypeEntry } from '../change-grammar/types.ts';
import type { WorkTypeHeadings } from '../lib/work-types.ts';
import type { ChangeEntry } from './change-entries.ts';

/**
 * Renders the `## Details` body of a change summary from its entries: one `###` subsection per type, ordered by tier
 * and then by the taxonomy's listing order, holding one bullet per entry in the order given.
 *
 * A breaking entry's bullet opens with the breaking prefix, and a `migration` nests under its bullet as a list item
 * indented 4 spaces, which Bitbucket requires to read it as a child. Each bullet ends with its scopes as `#scope` tags
 * only when the entries do not all name the same set of scopes. Throws on an entry whose type the taxonomy does not
 * declare as a key or an alias, and on a `text` that spans more than one line, either of which would misplace or break
 * a bullet.
 */
export function renderDetails(
  entries: readonly ChangeEntry[],
  taxonomy: Taxonomy,
  { breakingPrefix, headings }: WorkTypeHeadings,
): string {
  const byKey = new Map<string, ChangeEntry[]>();
  entries.forEach((entry, index) => {
    if (/[\n\r]/.test(entry.text)) {
      throw new Error(`\`entries[${index}].text\` spans more than one line`);
    }
    const workType = findWorkType(entry.type, taxonomy);
    if (workType === undefined) {
      throw new Error(`\`entries[${index}].type\` names ${entry.type}, which the taxonomy does not declare`);
    }
    byKey.set(workType.key, [...(byKey.get(workType.key) ?? []), entry]);
  });

  const tagged = new Set(entries.map((entry) => describeScopeSet(entry.scopes))).size > 1;
  const sections = sortByRank(taxonomy).flatMap((workType) => {
    const grouped = byKey.get(workType.key);
    if (grouped === undefined) {
      return [];
    }
    const bullets = grouped.map((entry) => renderBullet(entry, breakingPrefix, tagged));
    return [`### ${headings.get(workType.key) ?? workType.key}\n\n${bullets.join('\n')}`];
  });
  return sections.join('\n\n');
}

// region | Helpers

/** Describes a list of scopes as a key that is equal for any two lists naming the same set. */
function describeScopeSet(scopes: readonly string[]): string {
  return JSON.stringify([...new Set(scopes)].sort());
}

/** Finds the taxonomy entry that a type names, by its key or one of its aliases. */
function findWorkType(type: string, taxonomy: Taxonomy): WorkTypeEntry | undefined {
  return (
    taxonomy.types.find((workType) => workType.key === type) ??
    taxonomy.types.find((workType) => workType.aliases?.includes(type) === true)
  );
}

/** Renders one entry's bullet, with its scope tags when `tagged` and its migration nested below it. */
function renderBullet(entry: ChangeEntry, breakingPrefix: string, tagged: boolean): string {
  const scopes = [...new Set(entry.scopes)];
  const tags = tagged && scopes.length > 0 ? ` ${scopes.map((scope) => `#${scope}`).join(', ')}` : '';
  const bullet = `- ${entry.breaking ? breakingPrefix : ''}${entry.text}${tags}`;
  return entry.migration === undefined ? bullet : `${bullet}\n    - Migration: ${entry.migration}`;
}

/** Orders the taxonomy's types by tier, then by listing order. */
function sortByRank(taxonomy: Taxonomy): WorkTypeEntry[] {
  const tierRank = (workType: WorkTypeEntry): number => {
    const rank = taxonomy.tiers.indexOf(workType.tier);
    return rank === -1 ? taxonomy.tiers.length : rank;
  };
  return taxonomy.types
    .map((workType, index) => ({ index, workType }))
    .sort((a, b) => tierRank(a.workType) - tierRank(b.workType) || a.index - b.index)
    .map(({ workType }) => workType);
}

// endregion | Helpers
