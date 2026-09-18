import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import type { HarnessId } from './types.ts';

/**
 * The Markdown link grammar that this module rewrites: `[text](target)`, capturing text then target. The grammar and
 * the passthrough predicate together define what gets rewritten, so a caller inspecting links matches on both. Safe to
 * share despite the `g` flag: `replace` and `matchAll` each leave `lastIndex` untouched between calls.
 */
export const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

/** The per-harness values to which the install-time template variables expand, resolved once per harness by the caller. */
export interface TemplateVariables {
  /** Guidance filename that `{harness_guidance_file}` tokens expand to (e.g. `CLAUDE.md`). */
  readonly guidanceFileName: string;
  /** Harness identifier that `{harness_id}` tokens expand to (e.g. `claude`), and whose tool names a render resolves against. */
  readonly harnessId: HarnessId;
  /** Harness home segment that `{harness_home_dir}` tokens expand to (e.g. `.claude`). */
  readonly homeDir: string;
}

/**
 * Maps a resolved link target to the absolute path at which it deploys. The argument is normalized and fragment-free,
 * so an implementation decides only which tree the target is deployed into, never how the target itself was resolved.
 *
 * Deployment location is not a property of the rewriting file: The same relative target can name a tree that `install`
 * populates in the harness home and one that `sync` populates in a project. The caller that knows which of the two
 * supplies this.
 */
export type ResolveLinkAnchor = (normalizedTarget: string) => string;

/** Anchors every target under one harness-relative prefix in the harness home. */
export function homeAnchor(pathPrefix: string): ResolveLinkAnchor {
  return (normalizedTarget) => `~/${pathPrefix}/${normalizedTarget}`;
}

/**
 * Reports whether a Markdown link target is one that this module resolves as a source-tree-relative path. False for the
 * forms that already name their destination or name nothing to resolve: `http(s)` URLs, absolute paths, `~`-prefixed
 * paths, anchor-only links, and targets opening with a `{template_variable}`, which expands to its own absolute path
 * after this pass.
 */
export function isRewritableLinkTarget(target: string): boolean {
  return !(
    /^https?:\/\//.test(target) ||
    target.startsWith('/') ||
    target.startsWith('~') ||
    target.startsWith('#') ||
    target.startsWith('{')
  );
}

/**
 * Lists the link targets in `content` that `rewriteMarkdownPaths` would rewrite, in source order and with duplicates
 * kept, so that a caller validating link targets tests exactly the set that gets rewritten. A caller needing a
 * wider set (anchor-only targets, say) matches on `MARKDOWN_LINK_REGEX` and filters for itself.
 */
export function listRewritableLinkTargets(content: string): ReadonlyArray<string> {
  const targets: Array<string> = [];
  for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = match[2];
    if (target !== undefined && isRewritableLinkTarget(target)) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * Rewrites relative Markdown link targets in `content` to the absolute paths at which their targets deploy. Each target
 * resolves against the directory of `fileRelPath`, and `anchor` maps the resolved result to its deployed location;
 * pass `homeAnchor` for a tree that lives entirely under one harness-relative prefix.
 */
export function rewriteMarkdownPaths(content: string, fileRelPath: string, anchor: ResolveLinkAnchor): string {
  const fileDir = path.posix.dirname(fileRelPath);

  return content.replace(MARKDOWN_LINK_REGEX, (_match, text: string, target: string) => {
    if (!isRewritableLinkTarget(target)) {
      return `[${text}](${target})`;
    }

    const hashIndex = target.indexOf('#');
    let pathPart: string;
    let fragment: string;
    if (hashIndex === -1) {
      pathPart = target;
      fragment = '';
    } else {
      pathPart = target.slice(0, hashIndex);
      fragment = target.slice(hashIndex);
    }

    const joined = path.posix.join(fileDir, pathPart);
    const normalized = path.posix.normalize(joined);

    return `[${text}](${anchor(normalized)}${fragment})`;
  });
}

/**
 * Expands install-time template variables in `content`: `{harness_home_dir}` to `~/{homeDir}` (e.g. `~/.claude`),
 * `{harness_guidance_file}` to the harness's guidance filename (e.g. `CLAUDE.md`), and `{harness_id}` to the harness
 * identifier (e.g. `claude`), the value that capture-event records as the agent harness.
 *
 * The guidance token expands to the bare filename rather than a path, so a body composes it as
 * `{harness_home_dir}/{harness_guidance_file}` when it needs the whole location and uses it alone when it does not.
 */
export function rewriteTemplateVariables(content: string, variables: TemplateVariables): string {
  // Replacer functions, not strings: A string replacement expands `$$`, `$&`, `` $` ``, and `$'`, so a
  // substitution value carrying one of them would be rewritten into the match that it was meant to replace.
  return content
    .replaceAll('{harness_guidance_file}', () => variables.guidanceFileName)
    .replaceAll('{harness_home_dir}', () => `~/${variables.homeDir}`)
    .replaceAll('{harness_id}', () => variables.harnessId);
}

/**
 * Applies Markdown path rewriting and template variable expansion to a single `.md` file.
 * `fileRelPath` is the file's path relative to the tree root that `pathPrefix` names.
 * For flat guidance files (one directory, no nesting) the caller typically passes the file's
 * basename.
 */
export async function rewritePathsInFile(
  filePath: string,
  fileRelPath: string,
  pathPrefix: string,
  variables: TemplateVariables,
): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf8');
    let rewritten = rewriteMarkdownPaths(content, fileRelPath, homeAnchor(pathPrefix));
    rewritten = rewriteTemplateVariables(rewritten, variables);
    if (rewritten !== content) {
      await writeFile(filePath, rewritten, 'utf8');
    }
  } catch (error) {
    throw chainError(`Failed to rewrite paths in ${filePath}`, error);
  }
}

/**
 * Walks `.md` files in `dirPath`, applies path and template variable rewrites, and writes back.
 * `destRoot` is the tree root used to compute each file's relative path (e.g., the skills install
 * directory for a skill tree, or the harness home for flat harness-guidance files).
 * `pathPrefix` is the harness-relative prefix for rewriting link targets (e.g., `.claude/skills`
 * for skills, `.claude` for harness guidance).
 */
export async function rewritePathsInDirectory(
  dirPath: string,
  destRoot: string,
  pathPrefix: string,
  variables: TemplateVariables,
): Promise<void> {
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await lstat(fullPath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      await rewritePathsInDirectory(fullPath, destRoot, pathPrefix, variables);
    } else if (entry.endsWith('.md')) {
      const fileRelPath = path.relative(destRoot, fullPath).split(path.sep).join('/');
      await rewritePathsInFile(fullPath, fileRelPath, pathPrefix, variables);
    }
  }
}
