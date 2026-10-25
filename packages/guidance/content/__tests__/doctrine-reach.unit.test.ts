import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { DOCTRINE_REACH } from '../test-utils/doctrine-reach.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// Each restatement check reads every authored Markdown file in the tree. Reading them once here limits the whole suite
// to a single pass.
const CONTENT_FILES = readContentFiles();

describe.each(Object.entries(DOCTRINE_REACH))('%s reach', (_name, { carriers, headline, phrases, source }) => {
  it.each(carriers)('is delivered once by %s', async (relativePath) => {
    const delivered = await readContentFile(relativePath);

    for (const phrase of phrases) {
      expect(delivered).toContain(phrase);
    }
    expect(countHeadline(delivered, headline), `${relativePath} states the headline other than once`).toBe(1);
  });

  it('is not stated in any content file but its source', async () => {
    const violations: Array<string> = [];
    const files = await CONTENT_FILES;
    for (const { relativePath, content } of files) {
      if (relativePath === source) continue;

      for (const phrase of phrases) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }

    const message = `The doctrine is stated once, in ${source}, and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Counts a headline in a body: whole lines for a Markdown heading, substrings for any other headline. */
function countHeadline(body: string, headline: string): number {
  return headline.startsWith('#')
    ? body.split('\n').filter((line) => line === headline).length
    : countOccurrences(body, headline);
}

/** Reads every authored content Markdown file, pairing each with its content-root-relative path. */
async function readContentFiles(): Promise<ReadonlyArray<{ relativePath: string; content: string }>> {
  const files = await listMarkdownFiles(CONTENT_ROOT);
  return Promise.all(
    files.map(async (file) => ({
      relativePath: path.relative(CONTENT_ROOT, file),
      content: await readFile(file, 'utf8'),
    })),
  );
}

// endregion | Helpers
