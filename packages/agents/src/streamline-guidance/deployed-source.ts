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
 * `Source:` line; a `sync` copy names only its slug in an ownership marker, which resolves under each content root.
 */
export function findDeployedSource(
  content: string,
  input: { root: string; contentRoots: readonly string[] },
): SourceLookup {
  const sourceUrl = SOURCE_LINE_REGEX.exec(content)?.[1];
  if (sourceUrl !== undefined) {
    const relative = BLOB_PATH_REGEX.exec(sourceUrl)?.[1];
    const candidate = relative === undefined ? undefined : path.join(input.root, decodeURIComponent(relative));
    return candidate !== undefined && existsSync(candidate)
      ? { found: candidate }
      : { reason: 'source-not-in-repository' };
  }

  const ownership = OWNERSHIP_MARKER_REGEX.exec(content);
  const kind = ownership?.[1];
  const slug = ownership?.[2];
  if (kind === undefined || slug === undefined) {
    return { reason: 'source-not-in-repository' };
  }
  const matches = input.contentRoots
    .map((contentRoot) => path.join(contentRoot, composeSourcePath(kind, slug)))
    .filter((candidate) => existsSync(candidate));
  if (matches.length > 1) {
    return { reason: 'ambiguous-source' };
  }
  const [match] = matches;
  return match === undefined ? { reason: 'source-not-in-repository' } : { found: match };
}

/**
 * Reports whether a file is a deployed copy: it contains a provenance headline or an ownership marker, or it lies in a
 * harness's deployed tree. A generated region such as an ambient block does not make a file a copy, since the rest of
 * such a file is authored.
 */
export function isDeployedCopy(absolutePath: string, content: string): boolean {
  return (
    PROVENANCE_HEADLINE_REGEX.test(content) || OWNERSHIP_MARKER_REGEX.test(content) || isHarnessDeployPath(absolutePath)
  );
}

// region | Helpers

/** Matches the repository-relative path in a GitHub blob URL, whose captured group is that path. */
const BLOB_PATH_REGEX = /\/blob\/[^/]+\/(.+)$/;

/** Matches the ownership marker that `sync` writes, whose captured groups are the artifact kind and its slug. */
const OWNERSHIP_MARKER_REGEX = /^[ \t]*<!-- codeassembly-(rulebook|skill|subagent):([a-z][a-z0-9-]*) -->[ \t]*$/m;

/** Matches the headline that `install` writes as a Markdown comment, or as a YAML comment inside frontmatter. */
const PROVENANCE_HEADLINE_REGEX = /^[ \t]*(?:<!--|#)[ \t]*GENERATED FILE\b/m;

/** Matches the `Source:` line below the provenance headline, whose captured group is the source's URL. */
const SOURCE_LINE_REGEX = /^[ \t]*(?:<!--|#)[ \t]*Source:[ \t]*(\S+?)[ \t]*(?:-->)?[ \t]*$/m;

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

// endregion | Helpers
