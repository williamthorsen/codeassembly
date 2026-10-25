import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

/**
 * Paths that a content file may not name: A reference to one is a consumer pointing at the doctrine instead of inlining
 * it.
 */
const RETIRED_REFERENCES: ReadonlyArray<string> = ['_data/comment-discipline.md', 'comment-audit-checklist'];

describe('comment-discipline references', () => {
  it('content files do not reach the doctrine by reference', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const reference of RETIRED_REFERENCES) {
        if (content.includes(reference)) {
          violations.push(`${path.relative(CONTENT_ROOT, file)} -> ${reference}`);
        }
      }
    }
    const message = `The doctrine is inlined now; these files must inline it or anchor to it, not point at it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});
