import { isScalar, isSeq } from 'yaml';

import { findPair, itemLine, valueLine } from '../frontmatter/yaml-position.ts';
import { findAliasFor } from '../tags/canonicalize.ts';
import type { Finding } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';

/**
 * Warn when a note's `tags` list contains a known alias, naming the canonical form.
 * Emits one warning per aliased tag in YAML-list order.
 * Unknown tags (neither canonical nor alias) are new vocabulary and are not flagged.
 *
 * No-ops when no aliases are configured, and defers structural complaints (missing frontmatter, non-list tags) to
 * {@link frontmatterRule}.
 */
export const tagAliasRule: KbRule = {
  name: 'tag-alias',
  check(input: KbRuleInput): Finding[] {
    const { note, document, aliases } = input;
    if (aliases === undefined || document === null || note.frontmatterRaw === null) {
      return [];
    }
    if (note.frontmatterRaw.parseError !== undefined) {
      return [];
    }

    const tagsPair = findPair(document.doc, 'tags');
    if (tagsPair === null || !isSeq(tagsPair.value)) {
      return [];
    }

    const findings: Finding[] = [];
    const fallbackLine = valueLine(tagsPair, document.raw);
    for (const item of tagsPair.value.items) {
      if (!isScalar(item) || typeof item.value !== 'string') continue;
      const canonical = findAliasFor(item.value, aliases);
      if (canonical === null) continue;
      findings.push({
        path: note.path,
        line: itemLine(item, document.raw, fallbackLine),
        rule: 'frontmatter.tag-alias',
        severity: 'warning',
        message: `tag "${item.value}" is an alias — use canonical form "${canonical}"`,
      });
    }
    return findings;
  },
};
