import type { Finding } from '../types.ts';
import { countNewlines } from '../vault-integrity/wikilink-parse.ts';

/** The note fields the paths lint reads: its path and its full raw content. */
export interface PathsNote {
  path: string;
  content: string;
}

/**
 * Flags hardcoded `/Users/{name}/` paths anywhere in the note (`paths.user-home`, error), reporting each occurrence at
 * its line. The convention is `~/` for portability and to avoid leaking local usernames. Scans the full raw content,
 * including frontmatter and code blocks, so a `/Users/{name}/` path inside a fenced or inline code example is flagged
 * too.
 */
export function pathsFindings(note: PathsNote): Finding[] {
  const findings: Finding[] = Array.from(note.content.matchAll(USER_HOME), (match) => ({
    path: note.path,
    line: countNewlines(note.content, match.index) + 1,
    rule: 'paths.user-home',
    severity: 'error',
    message: `hardcoded "${match[0]}" — replace with ~/`,
  }));
  return findings;
}

// region | Helpers

const USER_HOME = /\/Users\/[A-Za-z0-9_.-]+\//g;

// endregion | Helpers
