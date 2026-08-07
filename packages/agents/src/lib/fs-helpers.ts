import type { Dirent } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

import { isEnoent } from './type-guards.ts';

/**
 * The directory name holding test code. Fixture data nests inside it rather than sitting in a directory of its own,
 * so this one name covers both.
 */
export const TEST_DIRECTORY_NAME = '__tests__';

/**
 * True when a directory entry holds test code rather than deliverable content. Test code is never published, never
 * installed into a harness home, and never read as content by a check that walks a content tree.
 */
export function isTestDirectory(name: string): boolean {
  return name === TEST_DIRECTORY_NAME;
}

/**
 * True when `relativePath` passes through a test directory at any depth. A walk over a content tree drops what this
 * matches: fixture data is authored for one suite to read, and every other check that walks the tree would otherwise
 * scan it as real content and report a defect against a file deliberately shaped to hold one.
 */
export function isUnderTestDirectory(relativePath: string): boolean {
  return relativePath.split(/[/\\]/).some((segment) => isTestDirectory(segment));
}

/** Lists visible (`.md`, non-`_`, non-dotfile) regular-file names directly in `dir`; empty when `dir` is absent. */
export async function listVisibleMarkdownFiles(dir: string): Promise<Array<string>> {
  return (await readDirEntries(dir))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && isVisible(entry.name))
    .map((entry) => entry.name);
}

/** Lists visible (non-`_`, non-dotfile) subdirectory names directly in `dir`; empty when `dir` is absent. */
export async function listVisibleSubdirectories(dir: string): Promise<Array<string>> {
  return (await readDirEntries(dir))
    .filter((entry) => entry.isDirectory() && isVisible(entry.name))
    .map((entry) => entry.name);
}

/** Reads `dir` with file types, returning `[]` when the directory does not exist. */
export async function readDirEntries(dir: string): Promise<Array<Dirent>> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}

/** Reads a file as UTF-8, returning an empty string when it does not exist. */
export async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

/** Writes `content` to `filePath` only when it differs from the current contents, keeping re-runs diff-free. */
export async function writeIfChanged(filePath: string, content: string): Promise<void> {
  if ((await readFileOrEmpty(filePath)) === content) {
    return;
  }
  await writeFile(filePath, content, 'utf8');
}

// region | Helpers

/** True when a directory entry is neither a reserved `_`-prefixed support entry nor a dotfile. */
function isVisible(name: string): boolean {
  return !name.startsWith('_') && !name.startsWith('.');
}

// endregion | Helpers
