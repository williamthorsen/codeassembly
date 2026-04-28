import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Subagent definitions are installed to both Claude Code and Rovo Dev. Rovo Dev does not load
// CLAUDE.md, so referencing it leaves Rovo Dev subagents pointing at a file that does not apply.
// Reference platform-neutral guidance instead — typically ~/.agents/AGENTS.md and .agents/PROJECT.md.
// See issue #471.

const SUBAGENTS_DIR = new URL('../../content/subagents/', import.meta.url).pathname;
const FORBIDDEN_SUBSTRING = 'CLAUDE.md';

interface Violation {
  readonly file: string;
  readonly line: number;
}

/** Scan top-level .md files in the subagents directory for the forbidden substring. */
async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const entries = await readdir(SUBAGENTS_DIR);
  const violations: Array<Violation> = [];

  // Skip `_`-prefixed entries: `_data/` and similar overlay/internal directories may legitimately
  // contain platform-specific file names. The check applies only to subagent body content.
  for (const entry of entries) {
    if (entry.startsWith('_') || !entry.endsWith('.md')) {
      continue;
    }
    const content = await readFile(path.join(SUBAGENTS_DIR, entry), 'utf8');
    for (const [index, line] of content.split('\n').entries()) {
      if (line.includes(FORBIDDEN_SUBSTRING)) {
        violations.push({ file: entry, line: index + 1 });
      }
    }
  }

  return violations;
}

describe('subagent content', () => {
  it(`does not reference ${FORBIDDEN_SUBSTRING}`, async () => {
    const violations = await findViolations();
    expect(violations).toEqual([]);
  });
});
