import { parseDocument } from 'yaml';

import { readInjectedRulebooks, readInjectedSkills } from './dependency-frontmatter.ts';
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

  const merged = [...new Set([...readInjectedSkills(content, sourceLabel), ...deployNames])].toSorted();
  const { lines, body } = parseFrontmatter(content);
  const document = parseDocument(lines.join('\n'));
  document.delete('rulebooks');
  document.set('skills', merged);
  return `---\n${document.toString(ROUND_TRIP_OPTIONS)}---\n${body}`;
}
