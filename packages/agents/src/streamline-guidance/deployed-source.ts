/**
 * Recognizes a deployed copy of a guidance file and finds the source from which it was deployed, from the markers that
 * `install` and `sync` write into what they deploy.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { isHarnessDeployPath } from '../shared/is-harness-deploy-path.ts';

/** The outcome of a source lookup: the source's absolute path, or the reason that none was found. */
export type SourceLookup = { found: string } | { reason: 'ambiguous-source' | 'source-not-in-repository' };

/**
 * Finds the absolute path of a deployed copy's source inside the repository. An `install` copy names its source on a
 * `Source:` line, as a path within a source directory; a source directory outside the repository, such as another
 * checkout of the same content, resolves that path under each content root instead. A `sync` copy names only its slug
 * in an ownership marker, and `findDeployedSource` resolves that slug under each content root.
 */
export function findDeployedSource(
  content: string,
  input: { root: string; contentRoots: readonly string[] },
): SourceLookup {
  const sourceLine = SOURCE_LINE_REGEX.exec(content);
  if (sourceLine !== null) {
    const [, relative = '', sourceDir = ''] = sourceLine;
    const candidate = path.resolve(sourceDir, relative);
    if (isWithin(input.root, candidate)) {
      return existsSync(candidate) ? { found: candidate } : { reason: 'source-not-in-repository' };
    }
    return findUnderContentRoots(relative, input.contentRoots);
  }

  const ownership = OWNERSHIP_MARKER_REGEX.exec(content);
  const kind = ownership?.[1];
  const slug = ownership?.[2];
  if (kind === undefined || slug === undefined) {
    return { reason: 'source-not-in-repository' };
  }
  return findUnderContentRoots(composeSourcePath(kind, slug), input.contentRoots);
}

/**
 * Reports whether a file is a deployed copy. A generated region such as an ambient block does not make a file a copy,
 * since the rest of such a file is authored.
 */
export function isDeployedCopy(absolutePath: string, content: string): boolean {
  return (
    PROVENANCE_HEADLINE_REGEX.test(content) || OWNERSHIP_MARKER_REGEX.test(content) || isHarnessDeployPath(absolutePath)
  );
}

// region | Helpers

/** Matches the ownership marker that `sync` writes, whose captured groups are the artifact kind and its slug. */
const OWNERSHIP_MARKER_REGEX = /^[ \t]*<!-- codeassembly-(rulebook|skill|subagent):([a-z][a-z0-9-]*) -->[ \t]*$/m;

/** Matches the headline that `install` writes as a Markdown comment, or as a YAML comment inside frontmatter. */
const PROVENANCE_HEADLINE_REGEX = /^[ \t]*(?:<!--|#)[ \t]*GENERATED FILE\b/m;

/**
 * Matches the `Source:` line below the provenance headline, whose captured groups are the file's path within its source
 * and the source's directory.
 */
const SOURCE_LINE_REGEX = /^[ \t]*(?:<!--|#)[ \t]*Source:[ \t]*(\S+) in source "[^"]*" \((.+)\)[ \t]*(?:-->)?[ \t]*$/m;

/** Returns the path of an artifact's source file relative to its content root. */
function composeSourcePath(kind: string, slug: string): string {
  switch (kind) {
    case 'rulebook':
      return path.join('guidance', 'rulebooks', `${slug}.md`);
    case 'skill':
      return path.join('skills', slug, 'SKILL.md');
    default:
      return path.join('subagents', `${slug}.md`);
  }
}

/** Finds the one content root containing `relative`, reporting none or several as the reason that none was chosen. */
function findUnderContentRoots(relative: string, contentRoots: readonly string[]): SourceLookup {
  const matches = contentRoots
    .map((contentRoot) => path.join(contentRoot, relative))
    .filter((candidate) => existsSync(candidate));
  if (matches.length > 1) {
    return { reason: 'ambiguous-source' };
  }
  const [match] = matches;
  return match === undefined ? { reason: 'source-not-in-repository' } : { found: match };
}

/** Reports whether `candidate` is `root` or lies beneath it. */
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// endregion | Helpers
