import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Rewrites relative Markdown link targets in `content` to absolute `~`-prefixed paths.
 * Resolves each relative target against the directory of `fileRelPath` within the skills tree,
 * then maps to `~/{skillsPrefix}/{resolved}`.
 */
export function rewriteMarkdownPaths(content: string, fileRelPath: string, skillsPrefix: string): string {
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

    return `[${text}](~/${skillsPrefix}/${normalized}${fragment})`;
  });
}

/**
 * Replaces `{platform_home_dir}` with `~/{homeDir}` (e.g., `~/.claude`) in `content`.
 */
export function rewriteTemplateVariables(content: string, homeDir: string): string {
  return content.replaceAll('{platform_home_dir}', `~/${homeDir}`);
}

/**
 * Walks `.md` files in `dirPath`, applies path and template variable rewrites, and writes back.
 * `skillsDestDir` is the root skills install directory, used to compute each file's relative path.
 * `skillsPrefix` is the platform-relative prefix (e.g., `.claude/skills`).
 * `homeDir` is the platform home directory segment (e.g., `.claude`).
 */
export async function rewritePathsInDirectory(
  dirPath: string,
  skillsDestDir: string,
  skillsPrefix: string,
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
      await rewritePathsInDirectory(fullPath, skillsDestDir, skillsPrefix, homeDir);
    } else if (entry.endsWith('.md')) {
      try {
        const fileRelPath = path.relative(skillsDestDir, fullPath).split(path.sep).join('/');
        const content = await readFile(fullPath, 'utf8');
        let rewritten = rewriteMarkdownPaths(content, fileRelPath, skillsPrefix);
        rewritten = rewriteTemplateVariables(rewritten, homeDir);
        if (rewritten !== content) {
          await writeFile(fullPath, rewritten, 'utf8');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to rewrite paths in ${fullPath}: ${message}`);
      }
    }
  }
}
