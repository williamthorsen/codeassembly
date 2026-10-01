import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { isTestDirectory } from './test-directories.ts';

/**
 * Lists every authored Markdown file under a root at any depth, as absolute paths in sorted order, skipping the test
 * tree. Partials and dotfiles are included. Empty when the root is absent.
 */
export async function listMarkdownFiles(root: string): Promise<ReadonlyArray<string>> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !path.relative(root, file).split(path.sep).some(isTestDirectory))
    .toSorted();
}
