import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
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
    // Skip non-relative targets: URLs, absolute paths, tilde paths
    if (/^https?:\/\//.test(target) || target.startsWith('/') || target.startsWith('~')) {
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
 * Walks `.md` files in `dirPath`, applies `rewriteMarkdownPaths` to each, and writes back.
 * `skillsDestDir` is the root skills install directory, used to compute each file's relative path.
 * `skillsPrefix` is the platform-relative prefix (e.g., `.claude/skills`).
 */
export async function rewritePathsInDirectory(
  dirPath: string,
  skillsDestDir: string,
  skillsPrefix: string,
): Promise<void> {
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      await rewritePathsInDirectory(fullPath, skillsDestDir, skillsPrefix);
    } else if (entry.endsWith('.md')) {
      const fileRelPath = path.relative(skillsDestDir, fullPath).split(path.sep).join('/');
      const content = await readFile(fullPath, 'utf8');
      const rewritten = rewriteMarkdownPaths(content, fileRelPath, skillsPrefix);
      if (rewritten !== content) {
        await writeFile(fullPath, rewritten, 'utf8');
      }
    }
  }
}
