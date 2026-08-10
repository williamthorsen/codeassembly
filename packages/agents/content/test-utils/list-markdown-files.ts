import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { isUnderTestDirectory } from '../../src/lib/fs-helpers.ts';

/** Lists every authored Markdown file under a root, skipping the test tree. */
export async function listMarkdownFiles(root: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !isUnderTestDirectory(path.relative(root, file)));
}
