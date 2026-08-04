/**
 * Import resolution for the guidance-wiring readyup check.
 *
 * Claude Code resolves a raw `@` import against the directory holding the importing file, not against the
 * repository root, so the literal text of an import says nothing about where it points. A check that matches
 * the literal instead of resolving it passes on the very wiring it exists to reject.
 */

import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

const IMPORT_PATTERN = /(?<=^|\s)@\S+/g;

/** Where a document's raw `@` imports point, and whether one of them reaches the guidance file. */
export interface GuidanceImportOutcome {
  readonly doesReachGuidance: boolean;
  readonly resolvedPaths: ReadonlyArray<string>;
}

/**
 * Resolves every raw `@` import in a document against the directory holding it, and reports whether one of them
 * reaches the guidance file. Both `importingDirPath` and `guidancePath` must be absolute.
 */
export function resolveGuidanceImports(
  documentText: string,
  importingDirPath: string,
  guidancePath: string,
): GuidanceImportOutcome {
  const resolvedPaths = documentText
    .matchAll(IMPORT_PATTERN)
    .map((match) => resolveImportPath(match[0].slice(1), importingDirPath))
    .toArray();
  return {
    doesReachGuidance: resolvedPaths.includes(resolve(guidancePath)),
    resolvedPaths,
  };
}

// region | Helpers

/** Resolves one import specifier, honouring the absolute and `~`-prefixed forms Claude Code also accepts. */
function resolveImportPath(importPath: string, importingDirPath: string): string {
  if (importPath === '~' || importPath.startsWith('~/')) {
    return resolve(homedir(), importPath.slice(2));
  }
  if (isAbsolute(importPath)) {
    return resolve(importPath);
  }
  return resolve(importingDirPath, importPath);
}

// endregion | Helpers
