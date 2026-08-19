import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Two skills had hand-maintained copies of the `describe-change.sh` invocation, which drifted in wording while
// agreeing in substance. One statement is what keeps a correction to the invocation contract -- the flags, the JSON
// parse, the fallback -- from having to be applied twice.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the invocation; every consumer reaches it through an include. */
const PARTIAL = 'skills/_partials/commit-title-rendering.md';

/** The extraction the invocation ends in, which the `pr_title` and `ticket_title` variants beside it do not match. */
const EXTRACTION = "json.load(sys.stdin).get('commit_title'";

describe('commit-title rendering', () => {
  it('is stated in no content file but the partial', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === PARTIAL) continue;

      const content = await readFile(file, 'utf8');
      if (content.includes(EXTRACTION)) {
        violations.push(relativePath);
      }
    }

    const message = `The invocation is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});
