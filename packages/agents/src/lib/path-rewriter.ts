import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The Markdown link grammar this module rewrites: `[text](target)`, capturing text then target. Exported because the
 * grammar and the passthrough predicate together define what gets rewritten, so a caller inspecting links must match
 * on both to see the same set. Safe to share despite the `g` flag: `replace` and `matchAll` each leave `lastIndex`
 * untouched between calls.
 */
export const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Reports whether a Markdown link target is one this module resolves as a source-tree-relative path. False for the
 * forms that already name their destination or name nothing to resolve: `http(s)` URLs, absolute paths, `~`-prefixed
 * paths, anchor-only links, and targets opening with a `{template_variable}`, which expands to its own absolute path
 * after this pass. Exported so a caller that validates link targets tests exactly the set that gets rewritten.
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
 * kept, so a caller that validates link targets tests exactly the set that gets rewritten. A caller needing a wider
 * set — anchor-only targets, say — matches on `MARKDOWN_LINK_REGEX` and filters for itself.
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
 * Rewrites relative Markdown link targets in `content` to absolute `~`-prefixed paths.
 * Resolves each relative target against the directory of `fileRelPath` within the tree rooted
 * at `pathPrefix`, then maps to `~/{pathPrefix}/{resolved}`. The prefix is the harness-relative
 * directory under which the tree lives (e.g., `.claude/skills` for skills, `.claude` for
 * harness guidance files that sit directly in the harness home).
 */
export function rewriteMarkdownPaths(content: string, fileRelPath: string, pathPrefix: string): string {
  const fileDir = path.posix.dirname(fileRelPath);

  return content.replace(MARKDOWN_LINK_REGEX, (_match, text: string, target: string) => {
    if (!isRewritableLinkTarget(target)) {
      return `[${text}](${target})`;
    }

    // Split off anchor fragment before resolution
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

    // Resolve the relative path against the file's directory, then normalize to collapse ../
    const joined = path.posix.join(fileDir, pathPart);
    const normalized = path.posix.normalize(joined);

    return `[${text}](~/${pathPrefix}/${normalized}${fragment})`;
  });
}

/**
 * Expands install-time template variables in `content`: `{harness_home_dir}` to `~/{homeDir}` (e.g. `~/.claude`), and
 * `{harness_id}` to the harness identifier (e.g. `claude`), the value capture-event records as the agent
 * harness.
 */
export function rewriteTemplateVariables(content: string, homeDir: string, harnessId: string): string {
  return content.replaceAll('{harness_home_dir}', `~/${homeDir}`).replaceAll('{harness_id}', harnessId);
}

/**
 * Applies Markdown path rewriting and template variable expansion to a single `.md` file.
 * `fileRelPath` is the file's path relative to the tree root that `pathPrefix` names.
 * For flat guidance files (one directory, no nesting) the caller typically passes the file's
 * basename. `harnessId` is the harness identifier used to expand `{harness_id}`.
 */
export async function rewritePathsInFile(
  filePath: string,
  fileRelPath: string,
  pathPrefix: string,
  homeDir: string,
  harnessId: string,
): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf8');
    let rewritten = rewriteMarkdownPaths(content, fileRelPath, pathPrefix);
    rewritten = rewriteTemplateVariables(rewritten, homeDir, harnessId);
    if (rewritten !== content) {
      await writeFile(filePath, rewritten, 'utf8');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to rewrite paths in ${filePath}: ${message}`);
  }
}

/**
 * Walks `.md` files in `dirPath`, applies path and template variable rewrites, and writes back.
 * `destRoot` is the tree root used to compute each file's relative path (e.g., the skills install
 * directory for a skill tree, or the harness home for flat harness-guidance files).
 * `pathPrefix` is the harness-relative prefix for rewriting link targets (e.g., `.claude/skills`
 * for skills, `.claude` for harness guidance).
 * `homeDir` is the harness home directory segment (e.g., `.claude`), used to expand
 * `{harness_home_dir}` template variables. `harnessId` is the harness identifier,
 * used to expand `{harness_id}`.
 */
export async function rewritePathsInDirectory(
  dirPath: string,
  destRoot: string,
  pathPrefix: string,
  homeDir: string,
  harnessId: string,
): Promise<void> {
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await lstat(fullPath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      await rewritePathsInDirectory(fullPath, destRoot, pathPrefix, homeDir, harnessId);
    } else if (entry.endsWith('.md')) {
      const fileRelPath = path.relative(destRoot, fullPath).split(path.sep).join('/');
      await rewritePathsInFile(fullPath, fileRelPath, pathPrefix, homeDir, harnessId);
    }
  }
}
