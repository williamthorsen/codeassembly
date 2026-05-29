import type { Finding } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';

/**
 * Flags hardcoded `/Users/{name}/` paths anywhere in the note (`paths.user-home`, error). The convention is to use
 * `~/` for portability and to avoid leaking local usernames. Scans the full note content, including the
 * frontmatter, and reports each occurrence separately.
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

/** Counts the newlines in `text` before byte offset `upTo`. */
function countNewlines(text: string, upTo: number): number {
  let count = 0;
  for (let index = 0; index < upTo && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

// endregion | Helpers
