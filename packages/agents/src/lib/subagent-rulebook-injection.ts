import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { readInjectedRulebooks } from './dependency-frontmatter.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { resolveRulebookToken, type RulebookInvocationCatalog } from './invocation-tokens.ts';

/**
 * Stringify options that leave a subagent's frontmatter as authored apart from the keys the injection touches:
 * `lineWidth: 0` stops a long `description` from folding, and `flowCollectionPadding: false` keeps a flow `tools:`
 * list unpadded. Under the defaults, re-serialization would rewrite lines the injection never touched.
 */
const ROUND_TRIP_OPTIONS = { flowCollectionPadding: false, lineWidth: 0 } as const;

/**
 * Compiles a subagent's `rulebooks:` declaration into the `skills:` list the harness reads: each declared rulebook's
 * deploy name joins that list, and the source key is dropped, since a spent instruction left in generated output reads
 * as a live one. The merged list is deduplicated and alphabetized, matching the frontmatter list convention.
 *
 * Authored entries keep their own nodes, so a structured `{ name, ... }` entry reaches the deployed file with the
 * extra keys `EntrySchema` tolerates, and a flow sequence stays flow. Only the entries the injection adds are new.
 *
 * Content declaring no `rulebooks:` is returned unchanged rather than re-serialized, so a subagent that does not opt
 * in cannot have its frontmatter normalized as a side effect.
 *
 * Throws when a declared rulebook is unknown to `rulebooks` or deploys no skill to inject, reporting every offending
 * entry at once so an author sees the whole list. `sourceLabel` names the subagent in that error.
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
 * only the names it does not already carry. Deduplicated by entry name and alphabetized by it.
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

/** Reads the slug a `skills:` entry names, whether it is a bare scalar or the `{ name }` mapping `EntrySchema` allows. */
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
