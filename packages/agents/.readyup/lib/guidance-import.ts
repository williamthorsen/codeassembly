/**
 * Import resolution for the guidance-wiring readyup check.
 *
 * Claude Code resolves a raw `@` import against the directory holding the importing file, not against the
 * repository root, so the literal text of an import says nothing about where it points. A check that matches
 * the literal instead of resolving it passes on the very wiring it exists to reject.
 *
 * Claude Code also reads no import out of a fenced code block or a code span, which is how a document shows an
 * import without carrying one. Both are blanked before matching, so an example never counts as live wiring.
 */

import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

/** Bounded to one line, so a stray backtick masks no more than the line it sits on. */
const CODE_SPAN_PATTERN = /(`+)[^\n]*?\1/g;
const FENCE_CLOSER_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const FENCE_OPENER_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
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
  const resolvedPaths = maskCodeSpans(maskFencedBlocks(documentText))
    .matchAll(IMPORT_PATTERN)
    .map((match) => resolveImportPath(match[0].slice(1), importingDirPath))
    .toArray();
  return {
    doesReachGuidance: resolvedPaths.includes(resolve(guidancePath)),
    resolvedPaths,
  };
}

// region | Helpers

/** Blanks the content of every code span, so a path shown inline does not read as an import. */
function maskCodeSpans(documentText: string): string {
  return documentText.replaceAll(CODE_SPAN_PATTERN, (span) => ' '.repeat(span.length));
}

/**
 * Blanks every fenced code block, delimiters included. A fence left unclosed runs to the end of the document,
 * and a closer must repeat the opener's character at least as many times to end the block.
 */
function maskFencedBlocks(documentText: string): string {
  const lines = documentText.split('\n');
  let openDelimiter: string | undefined;
  for (const [index, line] of lines.entries()) {
    if (openDelimiter === undefined) {
      const opener = FENCE_OPENER_PATTERN.exec(line)?.[1];
      if (opener !== undefined) {
        openDelimiter = opener;
        lines[index] = '';
      }
      continue;
    }
    const closer = FENCE_CLOSER_PATTERN.exec(line)?.[1];
    if (closer?.startsWith(openDelimiter) === true) {
      openDelimiter = undefined;
    }
    lines[index] = '';
  }
  return lines.join('\n');
}

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
