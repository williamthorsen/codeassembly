import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Rewrites relative Markdown link targets in `content` to absolute `~`-prefixed paths.
 * Resolves each relative target against the directory of `fileRelPath` within the tree rooted
 * at `pathPrefix`, then maps to `~/{pathPrefix}/{resolved}`. The prefix is the platform-relative
 * directory under which the tree lives (e.g., `.claude/skills` for skills, `.claude` for
 * platform guidance files that sit directly in the platform home).
 */
export function rewriteMarkdownPaths(content: string, fileRelPath: string, pathPrefix: string): string {
  const fileDir = path.posix.dirname(fileRelPath);

  // Match Markdown links [text](target) where target is a relative path
  return content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text: string, target: string) => {
    // Skip non-relative targets: URLs, absolute paths, tilde paths, anchor-only links
    if (/^https?:\/\//.test(target) || target.startsWith('/') || target.startsWith('~') || target.startsWith('#')) {
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
 * Replaces `{platform_home_dir}` with `~/{homeDir}` (e.g., `~/.claude`) in `content`.
 */
export function rewriteTemplateVariables(content: string, homeDir: string): string {
  return content.replaceAll('{platform_home_dir}', `~/${homeDir}`);
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
  homeDir: string,
): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf8');
    let rewritten = rewriteMarkdownPaths(content, fileRelPath, pathPrefix);
    rewritten = rewriteTemplateVariables(rewritten, homeDir);
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
 * directory for a skill tree, or the platform home for flat platform-guidance files).
 * `pathPrefix` is the platform-relative prefix for rewriting link targets (e.g., `.claude/skills`
 * for skills, `.claude` for platform guidance).
 * `homeDir` is the platform home directory segment (e.g., `.claude`), used to expand
 * `{platform_home_dir}` template variables.
 */
export async function rewritePathsInDirectory(
  dirPath: string,
  destRoot: string,
  pathPrefix: string,
  homeDir: string,
): Promise<void> {
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await lstat(fullPath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      await rewritePathsInDirectory(fullPath, destRoot, pathPrefix, homeDir);
    } else if (entry.endsWith('.md')) {
      const fileRelPath = path.relative(destRoot, fullPath).split(path.sep).join('/');
      await rewritePathsInFile(fullPath, fileRelPath, pathPrefix, homeDir);
    }
  }
}
