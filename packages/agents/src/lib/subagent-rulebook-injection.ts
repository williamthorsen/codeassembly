import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { readInjectedRulebooks } from './dependency-frontmatter.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { resolveRulebookToken, type RulebookInvocationCatalog } from './invocation-tokens.ts';

/**
 * Stringify options that leave a subagent's frontmatter as authored apart from the keys touched by the injection:
 * `lineWidth: 0` stops a long `description` from folding, and `flowCollectionPadding: false` keeps a flow `tools:`
 * list unpadded. Under the defaults, re-serialization would rewrite lines that the injection never touched.
 */
const ROUND_TRIP_OPTIONS = { flowCollectionPadding: false, lineWidth: 0 } as const;

/**
 * Compiles a subagent's `rulebooks:` declaration into the `skills:` list that the harness reads: The injection adds
 * each declared rulebook's deploy name to that list and drops the source key, since a spent instruction left in
 * generated output reads as a live one. The merged list is deduplicated and alphabetized, matching the frontmatter
 * list convention.
 *
 * Authored entries keep their own nodes, so a structured `{ name, ... }` entry is written to the deployed file with
 * the extra keys tolerated by `EntrySchema`, and a flow sequence stays flow. Only the entries that the injection adds
 * are new.
 *
 * Content declaring no `rulebooks:` is returned unchanged rather than re-serialized. A subagent that does not opt in
 * cannot have its frontmatter normalized as a side effect.
 *
 * Throws when a declared rulebook is unknown to `rulebooks` or deploys no skill to inject, reporting every offending
 * entry at once so that an author sees the whole list. `sourceLabel` names the subagent in that error.
 */
export function injectDeclaredRulebooks(
  content: string,
  rulebooks: RulebookInvocationCatalog,
  sourceLabel: string,
): string {
  const declared = readInjectedRulebooks(content, sourceLabel);
  if (declared.length === 0) {
    return content;
  }

  const deployNames: Array<string> = [];
  const rejections: Array<string> = [];
  for (const slug of declared) {
    const resolution = resolveRulebookToken(slug, rulebooks);
    if (resolution.kind === 'rejected') {
      rejections.push(`  ${slug} -- it ${resolution.reason}`);
    } else {
      deployNames.push(resolution.skillName);
    }
  }
  if (rejections.length > 0) {
    throw new Error(
      `${sourceLabel} declares ${rejections.length} unusable rulebook injection(s):\n${rejections.join('\n')}`,
    );
  }

  const { lines, body } = parseFrontmatter(content);
  const document = parseDocument(lines.join('\n'));
  document.delete('rulebooks');

  const authored = document.get('skills');
  const merged = mergeSkillEntries(isSeq(authored) ? authored.items : [], deployNames);
  if (isSeq(authored)) {
    authored.items = merged;
  } else {
    document.set('skills', merged);
  }
  return `---\n${document.toString(ROUND_TRIP_OPTIONS)}---\n${body}`;
}

// region | Helpers

/**
 * Merges deploy names into a subagent's authored `skills:` items, keeping each authored item's own node and appending
 * only the names that it does not already contain. Deduplicated by entry name and alphabetized by it.
 */
function mergeSkillEntries(authored: ReadonlyArray<unknown>, deployNames: ReadonlyArray<string>): Array<unknown> {
  const merged = [...authored];
  const seen = new Set(merged.map(readEntryName).filter((name) => name !== undefined));
  for (const name of deployNames) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    merged.push(name);
  }
  return merged.toSorted((left, right) => (readEntryName(left) ?? '').localeCompare(readEntryName(right) ?? ''));
}

/**
 * Reads the slug that a `skills:` entry names, whether it is a bare scalar or the `{ name }` mapping allowed by
 * `EntrySchema`.
 */
function readEntryName(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }
  if (isScalar(item)) {
    return typeof item.value === 'string' ? item.value : undefined;
  }
  if (isMap(item)) {
    const name = item.get('name');
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

// endregion | Helpers
