import type { Finding } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';
import {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  WIKILINK,
} from './wikilink-parse.ts';

/**
 * Flags `[[Target]]` references that do not resolve against the vault index. An unresolved target is an error
 * (`wikilinks.unresolved`); a target whose basename matches more than one note is a warning (`wikilinks.ambiguous`).
 *
 * The note body is masked for fenced and inline code before scanning so wikilink-shaped text inside code (e.g. a
 * bash `[[ -n "$x" ]]`) is not flagged. Backslash-escaped links, intra-doc anchors, and non-Markdown embeds are
 * skipped. No-ops when no vault index is supplied.
 */
export const wikilinksRule: KbRule = {
  name: 'wikilinks',
  check(input: KbRuleInput): Finding[] {
    const { note, vaultIndex } = input;
    if (vaultIndex === undefined) {
      return [];
    }

    const findings: Finding[] = [];
    const body = maskInlineCode(maskFencedCode(note.body));
    for (const match of body.matchAll(WIKILINK)) {
      const inner = match[1];
      if (inner === undefined) continue;
      const target = extractTarget(inner);
      if (target === null) continue;
      if (hasNonMarkdownExtension(target)) continue;
      const resolved = vaultIndex.get(lookupKey(target));
      const line = note.bodyStartLine + countNewlines(body, match.index);
      if (resolved === undefined || resolved.size === 0) {
        findings.push({
          path: note.path,
          line,
          rule: 'wikilinks.unresolved',
          severity: 'error',
          message: `[[${target}]] does not resolve to any vault note`,
        });
      } else if (resolved.size > 1) {
        findings.push({
          path: note.path,
          line,
          rule: 'wikilinks.ambiguous',
          severity: 'warning',
          message: `[[${target}]] is ambiguous — matches ${resolved.size} notes`,
        });
      }
    }
    return findings;
  },
};
