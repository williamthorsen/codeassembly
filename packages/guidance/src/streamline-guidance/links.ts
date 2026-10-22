/**
 * Link resolution for the streamline-guidance helper: the Markdown files to which a guidance file's content links,
 * through Markdown links and `{harness_home_dir}` references.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Lists the existing Markdown files to which content links: Markdown links resolved against the host's directory, and
 * `{harness_home_dir}` references mapped into the content root, whose tree is deployed beneath the harness home.
 */
export function listLinkedPaths(
  content: string,
  input: { contentRoot: string | undefined; home: string; hostDir: string },
): string[] {
  const found = new Set<string>();

  for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
    const resolved = resolveLinkTarget(match[2] ?? '', input);
    if (resolved !== undefined) found.add(resolved);
  }
  if (input.contentRoot !== undefined) {
    for (const match of content.matchAll(HARNESS_HOME_REFERENCE_REGEX)) {
      found.add(mapDeployedPathToContentRoot(input.contentRoot, trimTrailingPunctuation(match[1] ?? '')));
    }
  }

  return [...found].filter(
    (candidate) =>
      path.extname(candidate).toLowerCase() === '.md' && existsSync(candidate) && statSync(candidate).isFile(),
  );
}

// region | Helpers

/** Matches a `{harness_home_dir}` reference into a deployed tree, whose captured group is the path beneath the home. */
const HARNESS_HOME_REFERENCE_REGEX = /\{harness_home_dir\}\/((?:scripts|skills)\/[^\s`'"()<>[\]]+)/g;

/** Matches a Markdown link, whose captured groups are its text and its target. */
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Maps a path beneath the harness home to the content-root file deployed there. A source's support entries deploy
 * under `skills/_sources/<name>/`, a name that may be scoped, and are authored directly under `skills/`.
 */
function mapDeployedPathToContentRoot(contentRoot: string, beneath: string): string {
  return path.join(contentRoot, beneath.replace(/^skills\/_sources\/(?:@[^/]+\/)?[^/]+\//, 'skills/'));
}

/** Resolves a Markdown link target to an absolute path, or undefined when the target is not a local file. */
function resolveLinkTarget(
  rawTarget: string,
  input: { contentRoot: string | undefined; home: string; hostDir: string },
): string | undefined {
  const target = (rawTarget.trim().split(/\s/, 1)[0] ?? '').split('#', 1)[0] ?? '';
  if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return undefined;
  }
  if (target.startsWith('{harness_home_dir}/')) {
    const beneath = target.slice('{harness_home_dir}/'.length);
    return input.contentRoot !== undefined && /^(?:scripts|skills)\//.test(beneath)
      ? mapDeployedPathToContentRoot(input.contentRoot, beneath)
      : undefined;
  }
  if (target.startsWith('{')) {
    return undefined;
  }
  if (target.startsWith('~/')) {
    return path.join(input.home, target.slice(2));
  }
  return path.resolve(input.hostDir, target);
}

/** Drops the sentence punctuation that prose can leave after a bare path. */
function trimTrailingPunctuation(reference: string): string {
  return reference.replace(/[.,;:]+$/, '');
}

// endregion | Helpers
