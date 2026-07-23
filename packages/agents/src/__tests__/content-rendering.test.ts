import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;

// Written as an escape because a literal NBSP is invisible in source. The ban is total rather than indent-only: the
// sole reason to type one into guidance is to indent a subordinate line, and a blanket check needs no parsing to
// decide. The scan decodes each file rather than matching bytes — 0xA0 is a continuation byte of ■ (U+25A0) and ➕
// (U+2795), so a byte-level search reports every gradient example as a hit.
const NBSP = '\u{A0}';

describe('content rendering', () => {
  it('no Markdown under content/ carries a non-breaking space', async () => {
    const offenders: Array<string> = [];
    for (const relativePath of await listContentMarkdown()) {
      const body = await readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
      if (body.includes(NBSP)) {
        offenders.push(relativePath);
      }
    }
    expect(
      offenders,
      `These files carry a non-breaking space:\n  ${offenders.join('\n  ')}\n` +
        `A whitespace indent does not survive terminal rendering — the line collapses to the left margin and the ` +
        `reader cannot tell which option its reasoning belongs to. Nest the reasoning as a list item instead.`,
    ).toEqual([]);
  });
});

/** Returns every Markdown file under `content/`, as paths relative to it. */
async function listContentMarkdown(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true });
  return entries.filter((entry) => entry.endsWith('.md'));
}
