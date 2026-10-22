/**
 * Content-root lookup for the streamline-guidance helper: which directories of the repository are content roots, and
 * which one contains a file.
 */
import path from 'node:path';

import type { StreamlineGit } from './git.ts';
import { listWorkingTreeFiles } from './list-working-tree-files.ts';

/** Returns the innermost content root containing a file, or undefined when none does. */
export function findContentRoot(file: string, contentRoots: readonly string[]): string | undefined {
  return contentRoots
    .filter((contentRoot) => isInside(file, contentRoot))
    .toSorted((left, right) => right.length - left.length)[0];
}

/** Reports whether a path is the directory itself or lies beneath it. */
export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Lists the absolute directories of every content root in the repository. */
export function listContentRoots(root: string, git: StreamlineGit): string[] {
  return listWorkingTreeFiles(root, git, [`*${CONTENT_ROOT_MANIFEST}`])
    .filter((file) => path.basename(file) === CONTENT_ROOT_MANIFEST)
    .map((file) => path.join(root, path.dirname(file)));
}

// region | Helpers

/** Names the manifest file that marks a directory as a content root. */
const CONTENT_ROOT_MANIFEST = 'codeassembly-content.yaml';

// endregion | Helpers
