import type { Finding } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';
import { countNewlines } from './wikilink-parse.ts';

/**
 * Flags hardcoded `/Users/{name}/` paths anywhere in the note (`paths.user-home`, error). The convention is to use
 * `~/` for portability and to avoid leaking local usernames. Scans the full note content, including the frontmatter,
 * and reports each occurrence separately. Code blocks are not excluded, so a `/Users/{name}/` path inside a fenced
 * or inline code example is flagged too; this matches the upstream `check-notes` `paths` rule, which scans raw
 * content without code masking.
 */
export const pathsRule: KbRule = {
  name: 'paths',
  check(input: KbRuleInput): Finding[] {
    const { note } = input;
    const findings: Finding[] = [];
    for (const match of note.content.matchAll(USER_HOME)) {
      const line = countNewlines(note.content, match.index) + 1;
      findings.push({
        path: note.path,
        line,
        rule: 'paths.user-home',
        severity: 'error',
        message: `hardcoded "${match[0]}" — replace with ~/`,
      });
    }
    return findings;
  },
};

// region | Helpers

const USER_HOME = /\/Users\/[A-Za-z0-9_.-]+\//g;

// endregion | Helpers
